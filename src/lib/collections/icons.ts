/**
 * Approved icon system for collection cards. Pure and client-safe (no DB, no
 * `server-only`) so the storefront card, the admin editor, and the tests all use
 * the exact same keys and resolution rules.
 *
 * Admins pick from a fixed set of KEYS — never raw SVG/HTML — and the storefront
 * renders a matching inline SVG (see src/components/CollectionIcon.tsx). This
 * mirrors the `APPROVED_INFO_ICONS` pattern used for category landing pages.
 */

export const APPROVED_COLLECTION_ICONS = [
  "collection", // generic fallback (stacked cards)
  "gaming", // controller
  "gift", // gift card
  "subscription", // recurring / refresh
  "software", // window / license
  "sparkle", // new
  "trending", // popular / trending up
  "globe", // global / regional
  "navigator", // approved Navigator mark (Sélection du Navigator)
] as const;

export type CollectionIconKey = (typeof APPROVED_COLLECTION_ICONS)[number];

export const DEFAULT_COLLECTION_ICON: CollectionIconKey = "collection";

/** Coerce arbitrary persisted/admin input to a known icon key, or "" (none). */
export function normalizeCollectionIcon(value: unknown): CollectionIconKey | "" {
  if (typeof value !== "string") return "";
  const key = value.trim().toLowerCase();
  return (APPROVED_COLLECTION_ICONS as readonly string[]).includes(key)
    ? (key as CollectionIconKey)
    : "";
}

// Keyword → icon map used only as a fallback when no admin icon/image is set.
// Accent-insensitive, matched against the collection name + aliases.
const DERIVE_RULES: { icon: CollectionIconKey; keywords: string[] }[] = [
  { icon: "navigator", keywords: ["navigator", "navigateur", "selection", "sélection"] },
  { icon: "gaming", keywords: ["gaming", "jeu", "jeux", "game", "console"] },
  { icon: "gift", keywords: ["cadeau", "gift", "carte cadeau"] },
  { icon: "subscription", keywords: ["abonnement", "subscription", "divertissement", "streaming", "plus", "pass"] },
  { icon: "software", keywords: ["logiciel", "software", "licence", "license", "windows", "office"] },
  { icon: "sparkle", keywords: ["nouveau", "nouveaute", "nouveauté", "new", "recent"] },
  { icon: "trending", keywords: ["populaire", "popular", "tendance", "trending", "meilleure", "top"] },
  { icon: "globe", keywords: ["global", "monde", "world", "region", "région", "international"] },
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Resolve the icon key to render for a collection, in the required preference
 * order: an explicit approved admin icon wins; otherwise derive one from the
 * name/aliases; otherwise the generic fallback. (An uploaded image is handled by
 * the card itself, ahead of this — see CollectionCard.)
 */
export function resolveCollectionIcon(
  icon: unknown,
  name: string,
  aliases: string[] = [],
): CollectionIconKey {
  const explicit = normalizeCollectionIcon(icon);
  if (explicit) return explicit;

  const haystack = normalizeText([name, ...aliases].join(" "));
  for (const rule of DERIVE_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(normalizeText(kw)))) {
      return rule.icon;
    }
  }
  return DEFAULT_COLLECTION_ICON;
}

/**
 * A restrained accent color is usable only when it is a safe 3/6-digit hex.
 * Anything else (named colors, gradients, functions) is rejected so admin input
 * can never inject arbitrary CSS. Null/empty → caller uses the default blue.
 */
export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : null;
}
