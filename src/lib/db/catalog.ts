import "server-only";

import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { ensureDatabaseReady, prisma } from "./prisma";
import { defaultStoreSettings, mergeStoreSettings, type StoreSettings } from "@/lib/storeSettings";
import type { Category, Product, ProductVariantOption, StockMode, StockStatus } from "@/lib/types";

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

function isVariantPublic(row: ProductWithCategory, variant: ProductWithCategory["variants"][number]) {
  return row.active && variant.active && normalizeStockMode(variant.stockMode) !== "force_out_of_stock";
}

function variantStockStatus(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  inventoryMode: StoreSettings["inventoryMode"] = "automatic",
): StockStatus {
  const stockMode = normalizeStockMode(variant.stockMode);
  if (stockMode === "force_in_stock") return "in_stock";
  if (stockMode === "force_out_of_stock") return "out_of_stock";
  if (inventoryMode === "manual") return "in_stock";
  return variant._count.digitalCodes > 0 ? "in_stock" : "out_of_stock";
}

function variantTitle(parentName: string, variant: ProductWithCategory["variants"][number]) {
  return variant.faceValue != null
    ? `${parentName} ${variant.faceValue} ${variant.faceCurrency}`
    : variant.name;
}

function toVariantOption(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  inventoryMode?: StoreSettings["inventoryMode"],
): ProductVariantOption {
  return {
    id: variant.id,
    name: variant.name,
    title: variantTitle(row.name, variant),
    price: variant.priceMad,
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    active: variant.active,
    featured: variant.featured,
    stockMode: normalizeStockMode(variant.stockMode),
    stockStatus: variantStockStatus(row, variant, inventoryMode),
  };
}

function toVariantProduct(
  row: ProductWithCategory,
  variant: ProductWithCategory["variants"][number],
  inventoryMode?: StoreSettings["inventoryMode"],
): Product {
  const title = variantTitle(row.name, variant);
  const imageUrl = row.imageUrl ?? row.media[0]?.url ?? null;
  return {
    id: variant.id,
    parentId: row.slug,
    variantId: variant.id,
    href: `/products/${row.slug}?variant=${encodeURIComponent(variant.id)}`,
    name: title,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    price: variant.priceMad,
    deliveryType: row.deliveryType,
    description: row.description,
    imageUrl,
    featured: variant.featured,
    stockStatus: variantStockStatus(row, variant, inventoryMode),
  };
}

function toParentProduct(
  row: ProductWithCategory,
  selectedVariantId?: string,
  inventoryMode?: StoreSettings["inventoryMode"],
): Product {
  const variants = row.variants
    .filter((variant) => isVariantPublic(row, variant))
    .map((variant) => toVariantOption(row, variant, inventoryMode));
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const imageUrl = row.imageUrl ?? row.media[0]?.url ?? null;

  return {
    id: row.slug,
    name: row.name,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    price: row.priceMad,
    deliveryType: row.deliveryType,
    description: row.description,
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

export const getCatalogData = cache(async function getCatalogData(): Promise<{
  categories: Category[];
  products: Product[];
}> {
  return getCatalogPage({ take: 100 });
});

export async function getRegionCounts(): Promise<Record<string, number>> {
  await ensureDatabaseReady();
  const rows = await prisma.product.groupBy({
    by: ["region"],
    where: {
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.region] = row._count._all;
  return counts;
}

export async function getCatalogPage(options: {
  category?: string;
  region?: string;
  query?: string;
  page?: number;
  take?: number;
} = {}): Promise<{
  categories: Category[];
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await ensureDatabaseReady();
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
  const settings = await getStoreSettings();
  const variantProducts = productRows
    .flatMap((row, productIndex) =>
      row.variants
        .filter((variant) => isVariantPublic(row, variant))
        .map((variant, variantIndex) => ({
          product: toVariantProduct(row, variant, settings.inventoryMode),
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

  const publicCategories = categoryRows
    .map(toCategory)
    .filter((category) => (category.productCount ?? 0) > 0);

  return {
    categories: publicCategories,
    products: pagedProducts,
    total: variantProducts.length,
    page,
    pageSize,
  };
}

export async function getProductCatalog(): Promise<Product[]> {
  const { products } = await getCatalogData();
  return products;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  await ensureDatabaseReady();
  const product = await prisma.product.findFirst({
    where: {
      slug,
      active: true,
      variants: { some: { active: true } },
      categoryRecord: { is: { active: true } },
    },
    include: productCatalogInclude,
  });
  const settings = await getStoreSettings();
  return product ? toParentProduct(product, undefined, settings.inventoryMode) : null;
}

export async function getParentProductSlugs(): Promise<string[]> {
  await ensureDatabaseReady();
  const products = await prisma.product.findMany({
    where: {
      active: true,
      variants: { some: { active: true } },
      categoryRecord: { is: { active: true } },
    },
    select: { slug: true },
  });
  return products.map((product) => product.slug);
}

export async function getProductsByCategorySlug(
  category: string,
): Promise<Product[]> {
  await ensureDatabaseReady();
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
  const settings = await getStoreSettings();
  return products.flatMap((row) =>
    row.variants
      .filter((variant) => isVariantPublic(row, variant))
      .map((variant) => toVariantProduct(row, variant, settings.inventoryMode)),
  );
}

export const getStoreSettings = cache(async function getStoreSettings(): Promise<StoreSettings> {
  await ensureDatabaseReady();
  const record = await prisma.storeSetting.findUnique({
    where: { id: "default" },
  });
  return record ? mergeStoreSettings(record.value) : defaultStoreSettings;
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
