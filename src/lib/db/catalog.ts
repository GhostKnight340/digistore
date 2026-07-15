import "server-only";

import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { ensureDatabaseReady, prisma } from "./prisma";
import { CATALOG_TAG, STORE_SETTINGS_TAG } from "@/lib/cacheTags";
import {
  defaultStoreSettings,
  mergeStoreSettings,
  isInventoryEnabled,
  type StoreSettings,
} from "@/lib/storeSettings";
import { variantTitle } from "@/lib/pricing/variant-identity";
import { normalizeCategoryLanding } from "@/lib/categoryLanding";
import { scoreMatch, normalizeSearch } from "@/lib/search/text";
import { isCollectionPublic } from "@/lib/collections/schedule";
import { categoryHref } from "@/lib/categoryUrl";
import { collectionHref } from "@/lib/collectionUrl";
import { resolveCollectionIcon } from "@/lib/collections/icons";
import { guideHref, normalizeGuideIcon } from "@/lib/guide";
import { GUIDES_TAG } from "@/lib/cacheTags";

/** Subset of settings the stock helpers need. */
type StockOpts = Pick<StoreSettings, "inventoryEnabled" | "inventoryMode">;
import type {
  Category,
  CategorySearchResult,
  CollectionSearchResult,
  GuideSearchResult,
  Product,
  ProductSearchResult,
  ProductVariantOption,
  SearchGroupsResult,
  StockMode,
  StockStatus,
} from "@/lib/types";

type ProductWithCategory = Awaited<ReturnType<typeof getActiveProductRows>>[number];

const productCatalogInclude = {
  categoryRecord: true,
  media: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
  },
  variants: {
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { digitalCodes: { where: { status: "unused" } } },
      },
    },
  },
  _count: {
    select: { digitalCodes: { where: { status: "unused" } } },
  },
} satisfies Prisma.ProductInclude;

function normalizeStockMode(value: string): StockMode {
  return value === "force_in_stock" || value === "force_out_of_stock"
    ? value
    : "automatic";
}

function isVariantPublic(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  opts?: StockOpts,
) {
  if (!row.active || !variant.active) return false;
  // Inventory OFF: availability is active-only — the force_out_of_stock
  // stock-mode override is an inventory lever and is ignored.
  if (opts && !isInventoryEnabled(opts)) return true;
  return normalizeStockMode(variant.stockMode) !== "force_out_of_stock";
}

function variantStockStatus(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  opts?: StockOpts,
): StockStatus {
  const stockMode = normalizeStockMode(variant.stockMode);
  if (stockMode === "force_in_stock") return "in_stock";
  // Inventory OFF: never out-of-stock on quantity or force_out override.
  if (opts && !isInventoryEnabled(opts)) return "in_stock";
  if (stockMode === "force_out_of_stock") return "out_of_stock";
  if (!opts || opts.inventoryMode === "manual") return "in_stock";
  return variant._count.digitalCodes > 0 ? "in_stock" : "out_of_stock";
}

function toVariantOption(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  opts?: StockOpts,
): ProductVariantOption {
  return {
    id: variant.id,
    name: variant.name,
    title: variantTitle(row.name, variant),
    price: variant.priceMad,
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    // Per-variant region falls back to the parent product's region.
    region: variant.region || row.region,
    active: variant.active,
    featured: variant.featured,
    stockMode: normalizeStockMode(variant.stockMode),
    stockStatus: variantStockStatus(row, variant, opts),
  };
}

/**
 * Base64 `data:` product images are megabytes each. Inlining them in the catalog
 * DTO both bloats every response AND blows past the 2 MB `unstable_cache` limit
 * (which silently fails the cache write and throws). Serve those via the
 * cacheable image endpoint instead; plain URLs pass through. Mirrors the same
 * rule already applied in searchStorefront.
 */
function catalogImageUrl(rawImage: string | null, slug: string): string | null {
  if (!rawImage) return null;
  return rawImage.startsWith("data:")
    ? `/api/product-image/${encodeURIComponent(slug)}`
    : rawImage;
}

function toVariantProduct(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  opts?: StockOpts,
): Product {
  const title = variantTitle(row.name, variant);
  const imageUrl = catalogImageUrl(row.imageUrl ?? row.media[0]?.url ?? null, row.slug);
  const region = variant.region || row.region;
  return {
    id: variant.id,
    parentId: row.slug,
    variantId: variant.id,
    // Carry both region + variant so the group page opens with the exact
    // region/denomination the customer clicked preselected.
    href: `/products/${row.slug}?region=${encodeURIComponent(region)}&variant=${encodeURIComponent(variant.id)}`,
    name: title,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    // Cart/order rows resolve to the variant's region (falls back to parent).
    region: variant.region || row.region,
    // Natural-key parts so a renamed SKU doesn't orphan carts (lib/cartIdentity).
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    price: variant.priceMad,
    deliveryType: row.deliveryType,
    description: row.description,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    imageUrl,
    featured: variant.featured,
    stockStatus: variantStockStatus(row, variant, opts),
  };
}

function toParentProduct(
  row: ProductWithCategory,
  selectedVariantId?: string,
  opts?: StockOpts,
): Product {
  const variants = row.variants
    .filter((variant) => isVariantPublic(row, variant, opts))
    .map((variant) => toVariantOption(row, variant, opts));
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const imageUrl = catalogImageUrl(row.imageUrl ?? row.media[0]?.url ?? null, row.slug);

  return {
    id: row.slug,
    name: row.name,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    price: row.priceMad,
    deliveryType: row.deliveryType,
    description: row.description,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    imageUrl,
    featured: row.featured,
    stockStatus: selectedVariant?.stockStatus,
    variants,
    selectedVariantId: selectedVariant?.id,
  };
}

function toCategory(row: {
  id: string;
  slug: string;
  seoSlug?: string | null;
  name: string;
  description: string;
  tagline: string;
  gradient: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
  _count?: { products: number };
}): Category {
  return {
    id: row.id,
    slug: row.slug,
    seoSlug: row.seoSlug ?? null,
    name: row.name,
    description: row.description,
    tagline: row.tagline,
    gradient: row.gradient,
    icon: row.icon,
    iconUrl: row.iconUrl,
    coverImageUrl: row.coverImageUrl,
    accentColor: row.accentColor,
    active: row.active,
    sortOrder: row.sortOrder,
    productCount: row._count?.products ?? 0,
  };
}

function getActiveProductRows(options: {
  category?: string;
  region?: string;
  query?: string;
  skip?: number;
  take?: number;
} = {}) {
  return prisma.product.findMany({
    skip: options.skip,
    take: options.take,
    where: {
      active: true,
      category: options.category,
      region: options.region,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
      ...(options.query
        ? {
            OR: [
              { name: { contains: options.query, mode: "insensitive" } },
              { category: { contains: options.query, mode: "insensitive" } },
              {
                variants: {
                  some: {
                    OR: [
                      { id: { contains: options.query, mode: "insensitive" } },
                      { name: { contains: options.query, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: productCatalogInclude,
  });
}

export async function getCatalogData(): Promise<{
  categories: Category[];
  products: Product[];
}> {
  const { categories, products } = await getCatalogPage({ take: 100 });
  return { categories, products };
}

/**
 * All active categories, independent of whether they currently have products.
 * The homepage brand quick-nav uses this so brand tiles appear even pre-launch
 * (before any product exists) — unlike `getCatalogData`, which only surfaces
 * categories with `productCount > 0`. `productCount` is still populated (active
 * products only) for callers that want it.
 */
/**
 * For categories without a cover or icon, resolve one product's image so the
 * card falls back to real artwork instead of the placeholder. Batched: one
 * query for all the categories that need it, keeping the first active product
 * (by sortOrder) that has a usable image. Image resolution matches the
 * storefront's (imageUrl, else first media; data: URLs via the image route).
 */
async function resolveCategoryFallbackImages(
  categoryIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (categoryIds.length === 0) return result;
  const products = await prisma.product.findMany({
    where: { category: { in: categoryIds }, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      category: true,
      slug: true,
      imageUrl: true,
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
    },
  });
  for (const p of products) {
    if (result.has(p.category)) continue; // first match per category wins
    const url = catalogImageUrl(p.imageUrl ?? p.media[0]?.url ?? null, p.slug);
    if (url) result.set(p.category, url);
  }
  return result;
}

/** Fills `fallbackImageUrl` on categories with no admin-set cover/icon, from a
 *  product's image. Mutates + returns the same array. */
async function withCategoryFallbackImages(categories: Category[]): Promise<Category[]> {
  const needsFallback = categories.filter((c) => !c.coverImageUrl && !c.iconUrl);
  if (needsFallback.length === 0) return categories;
  const fallbacks = await resolveCategoryFallbackImages(needsFallback.map((c) => c.id));
  for (const category of categories) {
    if (!category.coverImageUrl && !category.iconUrl) {
      category.fallbackImageUrl = fallbacks.get(category.id) ?? null;
    }
  }
  return categories;
}

export const getActiveCategories = unstable_cache(
  async function getActiveCategories(): Promise<Category[]> {
    await ensureDatabaseReady();
    const rows = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            products: {
              where: {
                active: true,
                categoryRecord: { is: { active: true } },
                variants: { some: { active: true } },
              },
            },
          },
        },
      },
    });
    return withCategoryFallbackImages(rows.map(toCategory));
  },
  ["active-categories"],
  { tags: [CATALOG_TAG] },
);

/**
 * A single category resolved by id OR slug, including its normalized rich
 * landing content. Used by the category landing view (`/products?category=`)
 * and its `generateMetadata`. Returns null when no such active-or-inactive
 * category exists. Cached under CATALOG_TAG so admin category edits (which call
 * revalidateTag(CATALOG_TAG)) refresh it.
 */
export const getCategoryDetail = unstable_cache(
  async function getCategoryDetail(idOrSlug: string): Promise<Category | null> {
    await ensureDatabaseReady();
    const key = idOrSlug.trim();
    if (!key) return null;
    const row = await prisma.category.findFirst({
      where: { OR: [{ id: key }, { slug: key }, { seoSlug: key }] },
      include: {
        _count: {
          select: {
            products: {
              where: {
                active: true,
                categoryRecord: { is: { active: true } },
                variants: { some: { active: true } },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    return { ...toCategory(row), landing: normalizeCategoryLanding(row.landing) };
  },
  ["category-detail"],
  { tags: [CATALOG_TAG] },
);

/**
 * Lightweight index of active categories for the sitemap and pretty-URL
 * enumeration: id, name, and the SEO slug (may be empty). Cached under
 * CATALOG_TAG.
 */
export const getCategorySeoIndex = unstable_cache(
  async function getCategorySeoIndex(): Promise<
    { id: string; name: string; seoSlug: string }[]
  > {
    await ensureDatabaseReady();
    const rows = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, seoSlug: true },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, seoSlug: r.seoSlug ?? "" }));
  },
  ["category-seo-index"],
  { tags: [CATALOG_TAG] },
);

export const getRegionCounts = unstable_cache(
  async function getRegionCounts(
    options: { category?: string; query?: string } = {},
  ): Promise<Record<string, number>> {
    // Count public variants grouped by their parent product's region, scoped to
    // the current category/search — so the region chips only surface regions
    // that actually have products in the current view (matches both the grid and
    // the parent-region-based region filter). Not filtered by region itself, so
    // every available region is offered.
    const [rows, settings] = await Promise.all([
      getActiveProductRows({ category: options.category, query: options.query }),
      loadStoreSettings(),
    ]);
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const publicVariants = row.variants.filter((variant) =>
        isVariantPublic(row, variant, settings),
      ).length;
      if (publicVariants === 0 || !row.region) continue;
      counts[row.region] = (counts[row.region] ?? 0) + publicVariants;
    }
    return counts;
  },
  ["region-counts"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
);

type CatalogPageOptions = {
  category?: string;
  region?: string;
  query?: string;
  page?: number;
  take?: number;
};
type CatalogPageResult = {
  categories: Category[];
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
};

const getCatalogPageCached = unstable_cache(
  async (options: CatalogPageOptions): Promise<CatalogPageResult> => {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.take ?? 24));
  const [categoryRows, productRows] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            products: {
              where: {
                active: true,
                categoryRecord: { is: { active: true } },
                variants: { some: { active: true } },
              },
            },
          },
        },
      },
    }),
    getActiveProductRows({
      category: options.category,
      region: options.region,
      query: options.query,
    }),
  ]);
  const settings = await loadStoreSettings();
  const variantProducts = productRows
    .flatMap((row, productIndex) =>
      row.variants
        .filter((variant) => isVariantPublic(row, variant, settings))
        .map((variant, variantIndex) => ({
          product: toVariantProduct(row, variant, settings),
          productIndex,
          variantIndex,
        })),
    )
    .sort((a, b) => {
      if (a.product.featured !== b.product.featured) {
        return a.product.featured ? -1 : 1;
      }
      if (a.productIndex !== b.productIndex) return a.productIndex - b.productIndex;
      if (a.variantIndex !== b.variantIndex) return a.variantIndex - b.variantIndex;
      return a.product.name.localeCompare(b.product.name);
    })
    .map((entry) => entry.product);
  const pagedProducts = variantProducts.slice((page - 1) * pageSize, page * pageSize);

  const publicCategories = await withCategoryFallbackImages(
    categoryRows.map(toCategory).filter((category) => (category.productCount ?? 0) > 0),
  );

  return {
    categories: publicCategories,
    products: pagedProducts,
    total: variantProducts.length,
    page,
    pageSize,
  };
  },
  ["catalog-page"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
);

export async function getCatalogPage(
  options: CatalogPageOptions = {},
): Promise<CatalogPageResult> {
  return getCatalogPageCached(options);
}

/**
 * Parent-level product cards for a set of product ids (the real Product.id, not
 * the slug), keyed by product id. Reuses the exact catalogue visibility rules so
 * a collection can never surface a hidden/inactive/empty product, and collapses
 * each parent to ONE card with an "à partir de" starting price (so a collection
 * shows one entry per product family, not one per denomination). Products with
 * no public variant are omitted. Uncached — callers wrap their own read in
 * `unstable_cache` (CATALOG_TAG) or rely on page-level revalidation.
 */
/**
 * The subset of the given product ids that are eligible/public PARENT products
 * under the same catalogue rules as `getPublicParentCards` — but selecting only
 * `id`, so it is a single lightweight query with no media/variant/stock
 * hydration. Used to count eligible products for compact collection cards
 * without resolving (and throwing away) full product cards.
 *
 * Eligibility here is: active product + active category + at least one active
 * variant. This matches the card resolver's WHERE clause; it can only differ in
 * the rare edge case where inventory is enabled and every active variant is
 * force-out-of-stock (then the card resolver drops it but this still counts it).
 * That is acceptable for a homepage count and avoids the heavy per-card read.
 */
export async function getEligibleParentIds(
  productIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Set();
  const rows = await prisma.product.findMany({
    where: {
      id: { in: ids },
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

/**
 * Map a product row + its public variants to a storefront parent card. Shared by
 * every card site (collections, related products, ranked search) so the shape
 * and visibility-derived fields never drift.
 */
function buildParentCard(
  row: ProductWithCategory,
  publicVariants: ProductWithCategory["variants"],
  settings: StoreSettings,
): Product {
  const startingPrice = publicVariants.reduce(
    (min, variant) => (variant.priceMad < min ? variant.priceMad : min),
    publicVariants[0].priceMad,
  );
  const inStock = publicVariants.some(
    (variant) => variantStockStatus(row, variant, settings) === "in_stock",
  );
  return {
    id: row.slug,
    parentId: row.slug,
    href: `/products/${row.slug}`,
    name: row.name,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    price: startingPrice,
    deliveryType: row.deliveryType,
    description: row.description,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    imageUrl: catalogImageUrl(row.imageUrl ?? row.media[0]?.url ?? null, row.slug),
    featured: row.featured,
    stockStatus: inStock ? "in_stock" : "out_of_stock",
  };
}

export async function getPublicParentCards(
  productIds: string[],
): Promise<Map<string, Product>> {
  const map = new Map<string, Product>();
  if (productIds.length === 0) return map;
  const settings = await loadStoreSettings();
  const rows = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    include: productCatalogInclude,
  });
  for (const row of rows) {
    const publicVariants = row.variants.filter((variant) =>
      isVariantPublic(row, variant, settings),
    );
    if (publicVariants.length === 0) continue;
    map.set(row.id, buildParentCard(row, publicVariants, settings));
  }
  return map;
}

/**
 * Visible parent-product cards for a list of SLUGS, returned in the SAME order as
 * the input. Hidden/inactive/removed products are silently dropped. Backs the
 * "Consultés récemment" section — so a product that becomes unavailable simply
 * disappears from history rather than leaking. Bounded to avoid unbounded reads.
 */
export async function getVisibleParentCardsBySlugs(
  slugs: string[],
): Promise<Product[]> {
  const clean = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))].slice(0, 24);
  if (clean.length === 0) return [];
  const settings = await loadStoreSettings();
  const rows = await prisma.product.findMany({
    where: {
      slug: { in: clean },
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    include: productCatalogInclude,
  });
  const bySlug = new Map<string, Product>();
  for (const row of rows) {
    const publicVariants = row.variants.filter((variant) =>
      isVariantPublic(row, variant, settings),
    );
    if (publicVariants.length === 0) continue;
    bySlug.set(row.slug, buildParentCard(row, publicVariants, settings));
  }
  return clean.map((slug) => bySlug.get(slug)).filter((p): p is Product => Boolean(p));
}

/**
 * Ranked full parent-product cards for the /search results page. Uses the exact
 * same accent/alias ranker and visibility rules as the header autocomplete, but
 * returns full `Product` cards (for `ProductCard`) rather than compact rows.
 * Parent-level only — variants never appear as separate results.
 */
export async function getRankedSearchProducts(
  rawQuery: string,
  limit = 48,
): Promise<Product[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  return getRankedSearchProductsCached(query, limit);
}

const getRankedSearchProductsCached = unstable_cache(
  async (query: string, limit: number): Promise<Product[]> => {
    const settings = await loadStoreSettings();
    const rows = await getActiveProductRows({ take: 300 });
    const scored: { score: number; product: Product }[] = [];
    for (const row of rows) {
      const publicVariants = row.variants.filter((variant) =>
        isVariantPublic(row, variant, settings),
      );
      if (publicVariants.length === 0) continue;
      const inStock = publicVariants.some(
        (variant) => variantStockStatus(row, variant, settings) === "in_stock",
      );
      const score = scoreMatch(
        {
          kind: "product",
          title: row.name,
          aliasText: [
            row.brand ?? "",
            row.categoryRecord?.name ?? row.category,
            ...(row.searchAliases ?? []),
          ]
            .filter(Boolean)
            .join(" "),
          haystack: [
            row.shortDescription ?? "",
            row.description,
            row.region,
            ...publicVariants.map((variant) =>
              [variant.name, variant.region ?? "", variant.faceCurrency]
                .filter(Boolean)
                .join(" "),
            ),
          ]
            .filter(Boolean)
            .join(" "),
          inStock,
        },
        query,
      );
      if (score <= 0) continue;
      scored.push({ score, product: buildParentCard(row, publicVariants, settings) });
    }
    scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
    return scored.slice(0, limit).map((entry) => entry.product);
  },
  ["storefront-search-products"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
);

/**
 * When a query is specific enough to name a denomination (e.g. "steam 20 eur"),
 * deep-link the result to the product page with that variant/region
 * preselected, reusing the existing `?region=&variant=` selection behavior — no
 * new URL or variant page. Otherwise the plain parent path is returned.
 */
function searchProductHref(
  row: ProductWithCategory,
  publicVariants: ProductWithCategory["variants"],
  query: string,
): string {
  const base = `/products/${row.slug}`;
  const numbers = (normalizeSearch(query).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (numbers.length === 0) return base;
  const match = publicVariants.find(
    (variant) => variant.faceValue != null && numbers.includes(Number(variant.faceValue)),
  );
  if (!match) return base;
  const region = match.region || row.region;
  return `${base}?region=${encodeURIComponent(region)}&variant=${encodeURIComponent(match.id)}`;
}

/**
 * Grouped public storefront search: products (parent-level, ranked), categories,
 * and public collections. Reuses catalogue visibility, the shared accent/alias
 * ranker (`scoreMatch`), and the same image/url helpers as the rest of the
 * storefront. This is the single source for both the header autocomplete and the
 * results page; it never exposes stock counts, variants, cost, or admin data.
 *
 * Strategy note: at the current catalogue size the ranker runs in JS over a
 * bounded set of active rows (guaranteeing accent-insensitive + alias matching
 * that a plain SQL `contains` cannot). It sits behind this one function so it
 * can later be swapped for a DB/FTS index without touching the API or UI.
 */
export async function searchStorefront(
  rawQuery: string,
  opts: { productLimit?: number } = {},
): Promise<SearchGroupsResult> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return {
      query,
      products: [],
      categories: [],
      collections: [],
      guides: [],
      hasMore: false,
    };
  }
  return searchStorefrontCached(query, opts.productLimit ?? 6);
}

const searchStorefrontCached = unstable_cache(
  async (query: string, productLimit: number): Promise<SearchGroupsResult> => {
    const settings = await loadStoreSettings();
    const now = new Date();
    const [rows, categoryRows, collectionRows, guideRows] = await Promise.all([
      getActiveProductRows({ take: 300 }),
      prisma.category.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          tagline: true,
          seoSlug: true,
          aliases: true,
        },
      }),
      prisma.collection.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          slug: true,
          name: true,
          shortDescription: true,
          aliases: true,
          icon: true,
          active: true,
          startAt: true,
          endAt: true,
        },
      }),
      // Published, current guides only — never drafts/scheduled/archived.
      prisma.guide.findMany({
        where: {
          published: true,
          archivedAt: null,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
        take: 200,
        select: {
          slug: true,
          title: true,
          summary: true,
          platform: true,
          icon: true,
          aliases: true,
        },
      }),
    ]);

    // ── Products (parent-level, ranked) ──────────────────────────────────────
    const scoredProducts: { score: number; result: ProductSearchResult }[] = [];
    for (const row of rows) {
      const publicVariants = row.variants.filter((variant) =>
        isVariantPublic(row, variant, settings),
      );
      if (publicVariants.length === 0) continue;
      const inStock = publicVariants.some(
        (variant) => variantStockStatus(row, variant, settings) === "in_stock",
      );
      const score = scoreMatch(
        {
          kind: "product",
          title: row.name,
          // Brand, category name, and the record's editable search aliases all
          // count as alias matches (tier 2). Global synonyms live in text.ts.
          aliasText: [
            row.brand ?? "",
            row.categoryRecord?.name ?? row.category,
            ...(row.searchAliases ?? []),
          ]
            .filter(Boolean)
            .join(" "),
          // Region + variant denominations searched last so "france" or "20 eur"
          // still surface the parent (the variant is then preselected via href).
          haystack: [
            row.shortDescription ?? "",
            row.description,
            row.region,
            ...publicVariants.map((variant) =>
              [variant.name, variant.region ?? "", variant.faceCurrency]
                .filter(Boolean)
                .join(" "),
            ),
          ]
            .filter(Boolean)
            .join(" "),
          inStock,
        },
        query,
      );
      if (score <= 0) continue;
      const startingPrice = publicVariants.reduce(
        (min, variant) => (variant.priceMad < min ? variant.priceMad : min),
        publicVariants[0].priceMad,
      );
      const rawImage = row.imageUrl ?? row.media[0]?.url ?? null;
      scoredProducts.push({
        score,
        result: {
          id: row.slug,
          href: searchProductHref(row, publicVariants, query),
          name: row.name,
          category: row.category,
          categoryName: row.categoryRecord?.name ?? row.category,
          region: row.region,
          price: startingPrice,
          imageUrl: rawImage
            ? rawImage.startsWith("data:")
              ? `/api/product-image/${encodeURIComponent(row.slug)}`
              : rawImage
            : null,
        },
      });
    }
    scoredProducts.sort(
      (a, b) => b.score - a.score || a.result.name.localeCompare(b.result.name),
    );
    const products = scoredProducts.slice(0, productLimit).map((entry) => entry.result);
    const hasMore = scoredProducts.length > productLimit;

    // ── Categories ───────────────────────────────────────────────────────────
    const categories: CategorySearchResult[] = categoryRows
      .map((category) => ({
        score: scoreMatch(
          {
            kind: "category",
            title: category.name,
            aliasText: (category.aliases ?? []).join(" "),
            haystack: [category.description, category.tagline].filter(Boolean).join(" "),
          },
          query,
        ),
        category,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => ({
        id: entry.category.id,
        name: entry.category.name,
        href: categoryHref({ id: entry.category.id, seoSlug: entry.category.seoSlug }),
      }));

    // ── Collections (public/current only) ────────────────────────────────────
    const collections: CollectionSearchResult[] = collectionRows
      .filter((collection) => isCollectionPublic(collection, now))
      .map((collection) => ({
        score: scoreMatch(
          {
            kind: "collection",
            title: collection.name,
            aliasText: (collection.aliases ?? []).join(" "),
            haystack: collection.shortDescription,
          },
          query,
        ),
        collection,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => ({
        slug: entry.collection.slug,
        name: entry.collection.name,
        href: collectionHref(entry.collection.slug),
        shortDescription: entry.collection.shortDescription,
        icon: resolveCollectionIcon(
          entry.collection.icon,
          entry.collection.name,
          entry.collection.aliases ?? [],
        ),
      }));

    // ── Guides (published/current only) ──────────────────────────────────────
    const guides: GuideSearchResult[] = guideRows
      .map((guide) => ({
        score: scoreMatch(
          {
            kind: "product", // rank guides on the same content tiers as products
            title: guide.title,
            aliasText: [guide.platform, ...(guide.aliases ?? [])]
              .filter(Boolean)
              .join(" "),
            haystack: guide.summary,
          },
          query,
        ),
        guide,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => ({
        slug: entry.guide.slug,
        title: entry.guide.title,
        href: guideHref(entry.guide.slug),
        summary: entry.guide.summary,
        platform: entry.guide.platform,
        icon: normalizeGuideIcon(entry.guide.icon) || "",
      }));

    return { query, products, categories, collections, guides, hasMore };
  },
  ["storefront-search"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG, GUIDES_TAG] },
);

export async function getProductCatalog(): Promise<Product[]> {
  const { products } = await getCatalogData();
  return products;
}

export const getProductBySlug = unstable_cache(
  async (slug: string): Promise<Product | null> => {
    const product = await prisma.product.findFirst({
      where: {
        slug,
        active: true,
        variants: { some: { active: true } },
        categoryRecord: { is: { active: true } },
      },
      include: productCatalogInclude,
    });
    const settings = await loadStoreSettings();
    return product ? toParentProduct(product, undefined, settings) : null;
  },
  ["product-by-slug"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
);

export const getParentProductSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const products = await prisma.product.findMany({
      where: {
        active: true,
        variants: { some: { active: true } },
        categoryRecord: { is: { active: true } },
      },
      select: { slug: true },
    });
    return products.map((product) => product.slug);
  },
  ["parent-product-slugs"],
  { tags: [CATALOG_TAG] },
);

export const getProductsByCategorySlug = unstable_cache(
  async (category: string): Promise<Product[]> => {
    const products = await prisma.product.findMany({
      where: {
        category,
        active: true,
        variants: { some: { active: true } },
        categoryRecord: { is: { active: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: productCatalogInclude,
    });
    const settings = await loadStoreSettings();
    return products.flatMap((row) =>
      row.variants
        .filter((variant) => isVariantPublic(row, variant, settings))
        .map((variant) => toVariantProduct(row, variant, settings)),
    );
  },
  ["products-by-category"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
);

/** Uncached settings read. Used inside the catalog caches (which carry the
 *  settings tag themselves) so we never nest one `unstable_cache` in another. */
async function loadStoreSettings(): Promise<StoreSettings> {
  const record = await prisma.storeSetting.findUnique({
    where: { id: "default" },
  });
  return record ? mergeStoreSettings(record.value) : defaultStoreSettings;
}

export const getStoreSettings = unstable_cache(loadStoreSettings, ["store-settings"], {
  tags: [STORE_SETTINGS_TAG],
});

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  await ensureDatabaseReady();
  const merged = mergeStoreSettings(settings);
  await prisma.$transaction(async (tx) => {
    await tx.storeSetting.upsert({
      where: { id: "default" },
      update: { value: merged },
      create: { id: "default", value: merged },
    });
    await tx.productVariant.updateMany({
      data: { featured: false },
    });
    if (merged.featuredProductIds.length > 0) {
      await tx.productVariant.updateMany({
        where: { id: { in: merged.featuredProductIds } },
        data: { featured: true },
      });
    }
  });
}

export async function updateProductCatalogItem(
  slug: string,
  data: {
    name: string;
    category: string;
    price: number;
    region: string;
    deliveryType: string;
    description: string;
    featured: boolean;
  },
): Promise<void> {
  await ensureDatabaseReady();
  await prisma.product.update({
    where: { slug },
    data: {
      name: data.name,
      category: data.category,
      priceMad: data.price,
      region: data.region,
      deliveryType: data.deliveryType,
      description: data.description,
      featured: data.featured,
    },
  });
}
