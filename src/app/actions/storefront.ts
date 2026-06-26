"use server";

import {
  getCatalogData,
  getProductBySlug,
  getProductCatalog,
} from "@/lib/db/catalog";
import { getInventoryGroups } from "@/lib/db/inventory";
import type { Product, StockStatus } from "@/lib/types";

export async function getStorefrontProductsAction(): Promise<Product[]> {
  return withStockStatus(await getProductCatalog());
}

export async function getStorefrontProductAction(slug: string): Promise<Product | null> {
  return getProductBySlug(slug);
}

export async function getStorefrontFeaturedAction(): Promise<Product[]> {
  const products = await withStockStatus(await getProductCatalog());
  const featured = products.filter((product) => product.featured);
  return featured.length > 0 ? featured : products.slice(0, 8);
}

export async function getStorefrontProductsByIdsAction(
  slugs: string[],
): Promise<Product[]> {
  const products = await withStockStatus(await getProductCatalog());
  const bySlug = new Map(products.map((product) => [product.id, product]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((product): product is Product => Boolean(product));
}

async function getStockMap() {
  const inventory = await getInventoryGroups();
  return new Map(inventory.map((row) => [row.productId, row.unused]));
}

async function withStockStatus(products: Product[]): Promise<Product[]> {
  const stock = await getStockMap();
  return products.map((product) => ({
    ...product,
    stockStatus:
      product.stockStatus ??
      ((stock.get(product.parentId ?? product.id) ?? 0) > 0
        ? "in_stock"
        : "out_of_stock"),
  }));
}

export async function getCategoryCountsAction(): Promise<Record<string, number>> {
  const { categories } = await getCatalogData();
  return Object.fromEntries(categories.map((cat) => [cat.id, cat.productCount ?? 0]));
}

export async function getCategoryStockStatusesAction(): Promise<
  Record<string, StockStatus>
> {
  const [inventory, products] = await Promise.all([
    getInventoryGroups(),
    getProductCatalog(),
  ]);
  const productStock = new Map(inventory.map((row) => [row.productId, row.unused]));
  const status: Record<string, StockStatus> = {};

  for (const product of products) {
    const current = status[product.category];
    if (current === "in_stock") continue;
    status[product.category] =
      product.stockStatus ??
      ((productStock.get(product.parentId ?? product.id) ?? 0) > 0
        ? "in_stock"
        : "out_of_stock");
  }

  return status;
}
