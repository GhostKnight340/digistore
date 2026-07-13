/**
 * Public-search text primitives: normalization, a centralized alias table, and
 * a ranking scorer. Pure and client-safe (no DB, no `server-only`) so the
 * server search, the results page, and unit tests all share one implementation.
 *
 * This is the ONLY place storefront search aliases live — do not scatter
 * hardcoded synonyms through components. Per-record aliases (a collection's
 * `aliases`, a product brand) are passed in at match time via `RankableRecord`.
 */

/**
 * Accent- and case-insensitive normalization. Folds diacritics ("carté" →
 * "carte"), lowercases, and reduces any punctuation/whitespace run to a single
 * space so spacing/punctuation differences ("Play Station", "google-play") stop
 * mattering. French-friendly.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Split a normalized string into word tokens. */
export function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

/**
 * Centralized alias table. Each group maps a canonical storefront term to the
 * common alternate spellings customers type. Matching is done on normalized
 * text, so entries here are written in their natural form and normalized on use.
 */
export const ALIAS_GROUPS: { canonical: string; aliases: string[] }[] = [
  { canonical: "playstation", aliases: ["psn", "play station", "playstation network"] },
  { canonical: "google play", aliases: ["googleplay", "google-play", "gplay"] },
  { canonical: "apple", aliases: ["itunes", "app store", "appstore", "apple store"] },
  { canonical: "game pass", aliases: ["xbox game pass", "gamepass"] },
  { canonical: "steam wallet", aliases: ["steam card", "steam wallet code", "carte steam"] },
  { canonical: "free fire", aliases: ["freefire", "free-fire"] },
  { canonical: "xbox", aliases: ["x box"] },
];

const ALIAS_LOOKUP: { alias: string; canonical: string }[] = ALIAS_GROUPS.flatMap(
  (group) =>
    group.aliases.map((alias) => ({
      alias: normalizeSearch(alias),
      canonical: normalizeSearch(group.canonical),
    })),
);

/**
 * Canonical terms triggered by a query through the alias table. Typing "psn"
 * yields ["playstation"] so the ranker can treat a PlayStation product as an
 * (alias) match. A query already equal to a canonical term also returns it.
 */
export function aliasCanonicalTerms(rawQuery: string): string[] {
  const nq = normalizeSearch(rawQuery);
  if (!nq) return [];
  const out = new Set<string>();
  for (const { alias, canonical } of ALIAS_LOOKUP) {
    if (nq === alias || nq.includes(alias) || alias.includes(nq)) out.add(canonical);
  }
  for (const group of ALIAS_GROUPS) {
    const canonical = normalizeSearch(group.canonical);
    if (nq === canonical) out.add(canonical);
  }
  return [...out];
}

export type RankableKind = "product" | "category" | "collection";

export interface RankableRecord {
  kind: RankableKind;
  /** Primary display name (product/category/collection name). */
  title: string;
  /** Extra alias words specific to this record (brand, collection.aliases). */
  aliasText?: string;
  /** Description / metadata searched last. */
  haystack?: string;
  /** Only in-stock products get a small availability boost. */
  inStock?: boolean;
}

// Small kind offset so that, all content-matching being equal, an exact product
// beats an equally-scoring collection or category. Never large enough to let a
// category outrank an exact product-title match — content tiers dominate.
const KIND_BONUS: Record<RankableKind, number> = {
  product: 6,
  collection: 4,
  category: 2,
};

/**
 * Score a record against a query. 0 means "no match" (drop it). Higher is
 * better. Tiers follow the required order: exact title → exact alias → title
 * prefix → strong partial → category/collection metadata → description. An
 * exact product-title match therefore always outranks a broad category match.
 */
export function scoreMatch(record: RankableRecord, rawQuery: string): number {
  const nq = normalizeSearch(rawQuery);
  if (!nq) return 0;
  const canonicalTerms = aliasCanonicalTerms(rawQuery);
  const ntitle = normalizeSearch(record.title);
  const titleTokens = tokenize(ntitle);
  const queryTokens = tokenize(nq);
  const nAlias = record.aliasText ? normalizeSearch(record.aliasText) : "";
  const nHay = record.haystack ? normalizeSearch(record.haystack) : "";

  let base = 0;
  if (ntitle === nq) base = 1000;
  else if (nAlias && (nAlias === nq || nAlias.split(" ").includes(nq))) base = 910;
  else if (canonicalTerms.some((t) => ntitle === t)) base = 890;
  else if (ntitle.startsWith(nq)) base = 800;
  else if (titleTokens.length > 0 && titleTokens.every((t) => queryTokens.includes(t)))
    // Query is a superset of the title, e.g. "steam 20 eur" ⊇ "steam".
    base = 720;
  else if (ntitle.includes(nq)) base = 640;
  else if (canonicalTerms.some((t) => ntitle.includes(t))) base = 560;
  else if (nAlias && (nAlias.includes(nq) || queryTokens.some((t) => nAlias.includes(t))))
    base = 520;
  else if (queryTokens.some((t) => t.length > 1 && titleTokens.includes(t))) base = 420;
  else if (nHay && nHay.includes(nq)) base = 220;
  else base = 0;

  if (base === 0) return 0;
  return base + KIND_BONUS[record.kind] + (record.inStock ? 2 : 0);
}
