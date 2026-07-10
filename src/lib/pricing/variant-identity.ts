/**
 * Variant uniqueness identity for the Reloadly importer — the single rule that
 * decides "is this a duplicate?". Pure and testable (no server-only, no DB).
 *
 * Identity, given the current schema (ProductVariant has faceValue,
 * faceCurrency, reloadlyProductId, reloadlyCountryCode — there is NO per-variant
 * region column), is:
 *
 *     (parent product) + faceValue + faceCurrency + reloadlyCountryCode + reloadlyProductId
 *
 * Rationale:
 * - A regional Reloadly product carries its region via `reloadlyCountryCode`, so
 *   two "10 EUR" variants from different regions (e.g. an EU-zone card vs a
 *   different-country EUR card) have different country/provider ids and are NOT
 *   duplicates — legitimate regional variants are preserved.
 * - Re-importing the SAME Reloadly mapping (same reloadlyProductId, hence same
 *   country) at the same face value produces the SAME key → a true duplicate,
 *   which is skipped.
 * - Manual/local variants have null country/product id, so their identity
 *   collapses to (faceValue, faceCurrency) within the parent.
 *
 * Uniqueness is scoped to a parent product; the key here is the intra-parent
 * portion. The importer compares it against the parent's existing variants.
 */

export type VariantIdentityParts = {
  faceValue: number;
  faceCurrency: string;
  reloadlyProductId?: number | null;
  reloadlyCountryCode?: string | null;
};

/** Stable intra-parent identity key. Two variants with the same key on the same
 *  parent are the same variant (a duplicate). */
export function variantIdentityKey(v: VariantIdentityParts): string {
  const currency = v.faceCurrency.trim().toUpperCase();
  const country = (v.reloadlyCountryCode ?? "").trim().toUpperCase();
  const productId = v.reloadlyProductId ?? "";
  return `${v.faceValue}:${currency}:${country}:${productId}`;
}

export type VariantTitleParts = {
  name?: string | null;
  faceValue?: number | null;
  faceCurrency?: string | null;
};

/**
 * Display title for a variant, shown identically in the admin and on the
 * storefront: the parent product name followed by the variant's editable
 * `name`. The name defaults to "<faceValue> <faceCurrency>" at creation, so
 * denominated variants read the same as before ("Xbox Game Pass 24.99 USD")
 * while the title is now fully driven by — and editable through — the name
 * field. Falls back to the face-value label if the name is blank, then to the
 * bare parent name.
 */
export function variantTitle(parentName: string, v: VariantTitleParts): string {
  const label =
    (v.name?.trim() ?? "") ||
    (v.faceValue != null ? `${v.faceValue} ${v.faceCurrency ?? ""}`.trim() : "");
  return (label ? `${parentName} ${label}` : parentName).trim();
}

function slugifyPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * SKU for a variant. Includes the country so region-distinct variants under one
 * parent (e.g. Steam Wallet FR·10EUR vs US·10USD) never collide on the SKU.
 *
 * When the parent slug already ends with that same region code, the country is
 * NOT appended again — otherwise a region-named parent produces a doubled
 * segment (parent "google-play-us" + country "US" → "google-play-us-us-…"). The
 * region-neutral parent ("google-play") still gets the country, keeping FR/US
 * variants distinct.
 */
export function variantSku(parentSlug: string, v: VariantIdentityParts): string {
  const country = (v.reloadlyCountryCode ?? "").trim();
  const slugLower = parentSlug.trim().toLowerCase();
  const countryLower = country.toLowerCase();
  const parentEndsWithCountry =
    !!countryLower &&
    (slugLower === countryLower || slugLower.endsWith(`-${countryLower}`));
  const parts = [
    parentSlug,
    parentEndsWithCountry ? "" : country,
    String(v.faceValue),
    v.faceCurrency,
  ];
  return slugifyPart(parts.filter(Boolean).join("-")).slice(0, 170);
}
