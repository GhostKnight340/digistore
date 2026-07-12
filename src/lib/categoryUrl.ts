import type { Category } from "@/lib/types";

/** Namespace prefix for the public category landing pages. */
export const CATEGORY_URL_PREFIX = "/categorie";

/**
 * Canonical link for a category. Prefers the keyword-rich pretty URL
 * (`/categorie/<seoSlug>`) when the category has an SEO slug, otherwise falls
 * back to the legacy `?category=<id>` filter URL. Single source of truth so
 * every link site (BrandNav, CategoryCard, Footer, catalogue chips) stays
 * consistent, and old links keep working for categories without a slug.
 */
export function categoryHref(
  category: Pick<Category, "id" | "seoSlug">,
): string {
  const seoSlug = category.seoSlug?.trim();
  return seoSlug
    ? `${CATEGORY_URL_PREFIX}/${seoSlug}`
    : `/products?category=${category.id}`;
}

/** Pretty path from a raw SEO slug (already validated/normalized). */
export function categoryPathFromSlug(seoSlug: string): string {
  return `${CATEGORY_URL_PREFIX}/${seoSlug}`;
}
