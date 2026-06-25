import "server-only";

import { prisma } from "@/lib/prisma";
import type { Product } from "@/lib/types";
import type { CategoryId } from "@/lib/types";

async function buildParentMap(parentSlugs: string[]): Promise<Map<string, { description: string; thumbnail: string | null }>> {
  if (parentSlugs.length === 0) return new Map();
  const parents = await prisma.parentProduct.findMany({
    where: { slug: { in: parentSlugs } },
    select: { slug: true, description: true, thumbnail: true },
  });
  return new Map(parents.map((p) => [p.slug, p]));
}

function toProduct(
  variant: {
    slug: string;
    name: string;
    category: string;
    region: string;
    priceMad: number;
    deliveryType: string;
    featured: boolean;
    parentSlug: string;
  },
  parentMap: Map<string, { description: string; thumbnail: string | null }>,
): Product {
  const parent = parentMap.get(variant.parentSlug);
  return {
    id: variant.slug,
    name: variant.name,
    category: variant.category as CategoryId,
    region: variant.region,
    price: variant.priceMad,
    deliveryType: variant.deliveryType,
    description: parent?.description ?? "",
    featured: variant.featured,
    thumbnail: parent?.thumbnail ?? null,
  };
}

export async function getStorefrontProducts(): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants.map((v) => toProduct(v, parentMap));
}

export async function getStorefrontProduct(slug: string): Promise<Product | null> {
  const variant = await prisma.product.findUnique({
    where: { slug, active: true },
  });
  if (!variant) return null;
  const parentMap = await buildParentMap([variant.parentSlug]);
  return toProduct(variant, parentMap);
}

export async function getStorefrontProductsByCategory(category: string): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { category, active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants.map((v) => toProduct(v, parentMap));
}

export async function getStorefrontFeatured(): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { featured: true, active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants.map((v) => toProduct(v, parentMap));
}

export async function getStorefrontProductsByIds(slugs: string[]): Promise<Product[]> {
  if (slugs.length === 0) return [];
  const variants = await prisma.product.findMany({
    where: { slug: { in: slugs }, active: true },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants.map((v) => toProduct(v, parentMap));
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  const counts = await prisma.product.groupBy({
    by: ["category"],
    where: { active: true },
    _count: { id: true },
  });
  return Object.fromEntries(counts.map((r) => [r.category, r._count.id]));
}
