import "server-only";

import { prisma } from "@/lib/prisma";
import type { Product } from "@/lib/types";
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
    faceValue: number | null;
    faceCurrency: string;
  },
  parentMap: Map<string, ParentInfo>,
): Product {
  const parent = parentMap.get(variant.parentSlug);
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
  };
}

export async function getStorefrontProducts(): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants
    .filter((v) => parentMap.has(v.parentSlug))
    .map((v) => toProduct(v, parentMap));
}

export async function getStorefrontProduct(slug: string): Promise<Product | null> {
  const variant = await prisma.product.findUnique({
    where: { slug, active: true },
  });
  if (!variant) return null;
  const parentMap = await buildParentMap([variant.parentSlug]);
  if (!parentMap.has(variant.parentSlug)) return null;
  return toProduct(variant, parentMap);
}

export async function getStorefrontProductsByCategory(category: string): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { category, active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants
    .filter((v) => parentMap.has(v.parentSlug))
    .map((v) => toProduct(v, parentMap));
}

export async function getStorefrontFeatured(): Promise<Product[]> {
  const variants = await prisma.product.findMany({
    where: { featured: true, active: true },
    orderBy: { priceMad: "asc" },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants
    .filter((v) => parentMap.has(v.parentSlug))
    .map((v) => toProduct(v, parentMap));
}

export async function getStorefrontProductsByIds(slugs: string[]): Promise<Product[]> {
  if (slugs.length === 0) return [];
  const variants = await prisma.product.findMany({
    where: { slug: { in: slugs }, active: true },
  });
  const parentMap = await buildParentMap([...new Set(variants.map((v) => v.parentSlug))]);
  return variants
    .filter((v) => parentMap.has(v.parentSlug))
    .map((v) => toProduct(v, parentMap));
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
