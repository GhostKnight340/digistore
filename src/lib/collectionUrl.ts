/** Namespace prefix for the public collection pages. */
export const COLLECTION_URL_PREFIX = "/collections";

/**
 * Canonical link for a collection. Collections always have a slug (unique,
 * required), so unlike categories there is no legacy fallback. Single source of
 * truth so every link site (homepage sections, search, sitemap) stays
 * consistent.
 */
export function collectionHref(slug: string): string {
  return `${COLLECTION_URL_PREFIX}/${slug}`;
}
