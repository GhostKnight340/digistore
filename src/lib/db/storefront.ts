import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Product, StockStatus } from "@/lib/types";
import type { CategoryId } from "@/lib/types";

type ParentInfo = { name: string; description: string; thumbnail: string | null };

async function buildParentMap(parentSlugs: string[]): Promise<Map<string, ParentInfo>> {
  if (parentSlugs.length === 0) return new Map();
  const parents = await prisma.parentProduct.findMany({
    where: { slug: { in: parentSlugs }, active: true },
    select: { slug: true, name: true, description: true, thumbnail: true },
  });
  return new Map(parents.map((p) => [p.slug, p]));
}

async function buildInventoryMap(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const counts = await prisma.digitalCode.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, status: "unused" },
    _count: { id: true },
  });
  return new Map(counts.map((r) => [r.productId, r._count.id]));
}

function resolveStockStatus(stockMode: string, unusedCount: number): StockStatus {
  if (stockMode === "force_in_stock") return "in_stock";
  if (stockMode === "force_out_of_stock") return "out_of_stock";
  return unusedCount > 0 ? "in_stock" : "out_of_stock";
}

function toProduct(
  variant: {
    id: string;
    slug: string;
    name: string;
    category: string;
    region: string;
    priceMad: number;
    deliveryType: string;
    featured: boolean;
    parentSlug: string;
    faceValue: number | null;
    faceCurrency: string;
    stockMode: string;
  },
  parentMap: Map<string, ParentInfo>,
  inventoryMap: Map<string, number>,
): Product {
  const parent = parentMap.get(variant.parentSlug);
  const unusedCount = inventoryMap.get(variant.id) ?? 0;
  return {
    id: variant.slug,
    name: variant.name,
    parentName: parent?.name,
    category: variant.category as CategoryId,
    region: variant.region,
    price: variant.priceMad,
    deliveryType: variant.deliveryType,
    description: parent?.description ?? "",
    featured: variant.featured,
    thumbnail: parent?.thumbnail ?? null,
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    stockMode: variant.stockMode as Product["stockMode"],
    stockStatus: resolveStockStatus(variant.stockMode, unusedCount),
  };
}

async function fetchProducts(where: Prisma.ProductWhereInput) {
  const variants = await prisma.product.findMany({
    where,
    orderBy: { priceMad: "asc" },
  });
  const [parentMap, inventoryMap] = await Promise.all([
    buildParentMap([...new Set(variants.map((v) => v.parentSlug))]),
    buildInventoryMap(variants.map((v) => v.id)),
  ]);
  return variants
    .filter((v) => parentMap.has(v.parentSlug))
    .map((v) => toProduct(v, parentMap, inventoryMap));
}

export async function getStorefrontProducts(): Promise<Product[]> {
  return fetchProducts({ active: true });
}

export async function getStorefrontProduct(slug: string): Promise<Product | null> {
  const variant = await prisma.product.findUnique({ where: { slug, active: true } });
  if (!variant) return null;
  const [parentMap, inventoryMap] = await Promise.all([
    buildParentMap([variant.parentSlug]),
    buildInventoryMap([variant.id]),
  ]);
  if (!parentMap.has(variant.parentSlug)) return null;
  return toProduct(variant, parentMap, inventoryMap);
}

export async function getStorefrontProductsByCategory(category: string): Promise<Product[]> {
  return fetchProducts({ category, active: true });
}

export async function getStorefrontFeatured(): Promise<Product[]> {
  return fetchProducts({ featured: true, active: true });
}

export async function getStorefrontProductsByIds(slugs: string[]): Promise<Product[]> {
  if (slugs.length === 0) return [];
  return fetchProducts({ slug: { in: slugs }, active: true });
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  const activeParents = await prisma.parentProduct.findMany({
    where: { active: true },
    select: { slug: true },
  });
  const activeParentSlugs = activeParents.map((p) => p.slug);

  const counts = await prisma.product.groupBy({
    by: ["category"],
    where: { active: true, parentSlug: { in: activeParentSlugs } },
    _count: { id: true },
  });
  return Object.fromEntries(counts.map((r) => [r.category, r._count.id]));
}

/** Returns the automatic (inventory-based) stock status for each category. */
export async function getCategoryStockStatuses(): Promise<Record<string, StockStatus>> {
  const products = await getStorefrontProducts();
  const result: Record<string, StockStatus> = {};
  for (const p of products) {
    if (p.stockStatus === "in_stock") {
      result[p.category] = "in_stock";
    } else if (!result[p.category]) {
      result[p.category] = "out_of_stock";
    }
  }
  return result;
}
