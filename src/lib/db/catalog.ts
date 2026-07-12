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

/** Subset of settings the stock helpers need. */
type StockOpts = Pick<StoreSettings, "inventoryEnabled" | "inventoryMode">;
import type {
  Category,
  Product,
  ProductSearchResult,
  ProductVariantOption,
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
 * rule already applied in searchProductsPreview.
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
 * Header autocomplete search. Reuses the catalogue visibility rules
 * (`getActiveProductRows` + `isVariantPublic`) so it can never surface a hidden,
 * inactive, or empty product, then collapses each parent to a single compact
 * row with an "à partir de" starting price. Deliberately parent-level (not the
 * per-variant flattening the catalogue grid uses) so variants of one product
 * don't produce duplicate dropdown rows.
 */
export async function searchProductsPreview(
  rawQuery: string,
  limit = 6,
): Promise<{ results: ProductSearchResult[]; hasMore: boolean }> {
  const query = rawQuery.trim();
  if (query.length < 2) return { results: [], hasMore: false };
  return searchProductsPreviewCached(query, limit);
}

const searchProductsPreviewCached = unstable_cache(
  async (
    query: string,
    limit: number,
  ): Promise<{ results: ProductSearchResult[]; hasMore: boolean }> => {
  const settings = await loadStoreSettings();
  // Fetch a little wider than `limit`: some rows drop out once inventory/active
  // visibility is applied, and the surplus tells us whether to offer "voir tous
  // les résultats".
  const rows = await getActiveProductRows({ query, take: 25 });

  const matches: ProductSearchResult[] = [];
  for (const row of rows) {
    const publicVariants = row.variants.filter((variant) =>
      isVariantPublic(row, variant, settings),
    );
    if (publicVariants.length === 0) continue;
    const startingPrice = publicVariants.reduce(
      (min, variant) => (variant.priceMad < min ? variant.priceMad : min),
      publicVariants[0].priceMad,
    );
    const rawImage = row.imageUrl ?? row.media[0]?.url ?? null;
    matches.push({
      id: row.slug,
      href: `/products/${row.slug}`,
      name: row.name,
      category: row.category,
      categoryName: row.categoryRecord?.name ?? row.category,
      region: row.region,
      price: startingPrice,
      // Heavy base64 `data:` URIs are served via a cacheable image endpoint so
      // they don't bloat this JSON on every keystroke; light URLs pass through.
      imageUrl: rawImage
        ? rawImage.startsWith("data:")
          ? `/api/product-image/${encodeURIComponent(row.slug)}`
          : rawImage
        : null,
    });
  }

  return { results: matches.slice(0, limit), hasMore: matches.length > limit };
  },
  ["search-preview"],
  { tags: [CATALOG_TAG, STORE_SETTINGS_TAG] },
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
