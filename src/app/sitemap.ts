import type { MetadataRoute } from "next";
import { getCategorySeoIndex, getParentProductSlugs } from "@/lib/db/catalog";
import { getActiveCollectionSlugs } from "@/lib/db/collections";
import { getPublishedGuideSlugs } from "@/lib/db/guides";
import { categoryPathFromSlug } from "@/lib/categoryUrl";
import { collectionHref } from "@/lib/collectionUrl";
import { guideHref } from "@/lib/guide";
import { absoluteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

// Public, indexable storefront URLs. Admin/account/checkout/api are excluded
// here and blocked in robots.ts.
const STATIC_PATHS = ["/", "/products", "/collections", "/guides", "/support", "/about", "/conditions", "/privacy", "/terms", "/refunds"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, productSlugs, collectionSlugs, guides] = await Promise.all([
    getCategorySeoIndex().catch(() => []),
    getParentProductSlugs().catch(() => [] as string[]),
    // Only active, in-window, non-empty collections (see getActiveCollectionSlugs).
    getActiveCollectionSlugs().catch(() => [] as string[]),
    // Only published, non-scheduled, non-archived guides.
    getPublishedGuideSlugs().catch(() => [] as { slug: string; updatedAt: Date }[]),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === "/" || path === "/products" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories
    .filter((c) => c.seoSlug)
    .map((c) => ({
      url: absoluteUrl(categoryPathFromSlug(c.seoSlug)),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const productEntries: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: absoluteUrl(`/products/${slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const collectionEntries: MetadataRoute.Sitemap = collectionSlugs.map((slug) => ({
    url: absoluteUrl(collectionHref(slug)),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const guideEntries: MetadataRoute.Sitemap = guides.map((guide) => ({
    url: absoluteUrl(guideHref(guide.slug)),
    lastModified: guide.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...productEntries,
    ...collectionEntries,
    ...guideEntries,
  ];
}
