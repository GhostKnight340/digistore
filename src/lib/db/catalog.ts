import "server-only";

import { cache } from "react";
import { ensureDatabaseReady, prisma } from "./prisma";
import { defaultStoreSettings, mergeStoreSettings, type StoreSettings } from "@/lib/storeSettings";
import type { Category, Product } from "@/lib/types";

type ProductWithCategory = Awaited<ReturnType<typeof getActiveProductRows>>[number];

function toProduct(row: ProductWithCategory): Product {
  return {
    id: row.slug,
    name: row.name,
    category: row.category,
    categoryName: row.categoryRecord?.name ?? row.category,
    region: row.region,
    price: row.priceMad,
    deliveryType: row.deliveryType,
    description: row.description,
    featured: row.featured,
  };
}

function toCategory(row: {
  id: string;
  name: string;
  tagline: string;
  gradient: string;
  icon: string;
  _count?: { products: number };
}): Category {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    gradient: row.gradient,
    icon: row.icon,
    productCount: row._count?.products ?? 0,
  };
}

function getActiveProductRows(options: {
  category?: string;
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
      ...(options.query
        ? {
            OR: [
              { name: { contains: options.query, mode: "insensitive" } },
              { category: { contains: options.query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { categoryRecord: true },
  });
}

export const getCatalogData = cache(async function getCatalogData(): Promise<{
  categories: Category[];
  products: Product[];
}> {
  return getCatalogPage({ take: 100 });
});

export async function getCatalogPage(options: {
  category?: string;
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
  const pageSize = Math.min(48, Math.max(1, options.take ?? 24));
  const where = {
    active: true,
    category: options.category,
    ...(options.query
      ? {
          OR: [
            { name: { contains: options.query, mode: "insensitive" as const } },
            { category: { contains: options.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [categoryRows, productRows, total] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: { where: { active: true } } } } },
    }),
    getActiveProductRows({
      category: options.category,
      query: options.query,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    categories: categoryRows.map(toCategory),
    products: productRows.map(toProduct),
    total,
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
    where: { slug, active: true },
    include: { categoryRecord: true },
  });
  return product ? toProduct(product) : null;
}

export async function getProductsByCategorySlug(
  category: string,
): Promise<Product[]> {
  await ensureDatabaseReady();
  const products = await prisma.product.findMany({
    where: { category, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { categoryRecord: true },
  });
  return products.map(toProduct);
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
  await prisma.storeSetting.upsert({
    where: { id: "default" },
    update: { value: merged },
    create: { id: "default", value: merged },
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
