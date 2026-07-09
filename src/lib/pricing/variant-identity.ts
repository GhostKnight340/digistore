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
 */
export function variantSku(parentSlug: string, v: VariantIdentityParts): string {
  const parts = [parentSlug, v.reloadlyCountryCode ?? "", String(v.faceValue), v.faceCurrency];
  return slugifyPart(parts.filter(Boolean).join("-")).slice(0, 170);
}
