import type { MetadataRoute } from "next";
import { getCategorySeoIndex, getParentProductSlugs } from "@/lib/db/catalog";
import { categoryPathFromSlug } from "@/lib/categoryUrl";
import { absoluteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

// Public, indexable storefront URLs. Admin/account/checkout/api are excluded
// here and blocked in robots.ts.
const STATIC_PATHS = ["/", "/products", "/support", "/about", "/conditions", "/privacy", "/terms", "/refunds"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, productSlugs] = await Promise.all([
    getCategorySeoIndex().catch(() => []),
    getParentProductSlugs().catch(() => [] as string[]),
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

  return [...staticEntries, ...categoryEntries, ...productEntries];
}
