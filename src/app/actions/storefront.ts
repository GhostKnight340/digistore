"use server";

import {
  getCatalogData,
  getProductBySlug,
  getProductCatalog,
  getProductsByCategorySlug,
} from "@/lib/db/catalog";
import { getInventoryGroups, getVariantStockModes } from "@/lib/db/inventory";
import type { Product, StockMode, StockStatus } from "@/lib/types";

const LOW_STOCK_THRESHOLD = 3;

export async function getStorefrontProductsAction(): Promise<Product[]> {
  return withStockStatus(await getProductCatalog());
}

export async function getStorefrontProductAction(slug: string): Promise<Product | null> {
  const product = await getProductBySlug(slug);
  if (!product) return null;
  const [withStock] = await withStockStatus([product]);
  return withStock;
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

export async function withStockStatus(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products;
  const ids = products.map((p) => p.id);
  const [inventory, modeMap] = await Promise.all([
    getInventoryGroups(),
    getVariantStockModes(ids),
  ]);
  const stockMap = new Map(inventory.map((row) => [row.productId, row.unused]));
  return products.map((product) => {
    const mode = (modeMap.get(product.id) ?? "automatic") as StockMode;
    let stockStatus: StockStatus;
    if (mode === "force_in_stock") {
      stockStatus = "in_stock";
    } else if (mode === "force_out_of_stock") {
      stockStatus = "out_of_stock";
    } else {
      const unused = stockMap.get(product.id) ?? 0;
      stockStatus =
        unused === 0
          ? "out_of_stock"
          : unused <= LOW_STOCK_THRESHOLD
            ? "low_stock"
            : "in_stock";
    }
    return { ...product, stockStatus };
  });
}

export async function getCategoryCountsAction(): Promise<Record<string, number>> {
  const { categories } = await getCatalogData();
  const counts: Record<string, number> = {};
  for (const category of categories) {
    counts[category.id] = (await getProductsByCategorySlug(category.id)).length;
  }
  return counts;
}

export async function getCategoryStockStatusesAction(): Promise<
  Record<string, StockStatus>
> {
  const products = await getProductCatalog();
  const withStock = await withStockStatus(products);
  const status: Record<string, StockStatus> = {};

  const priority: Record<StockStatus, number> = { in_stock: 2, low_stock: 1, out_of_stock: 0 };
  for (const product of withStock) {
    const s = product.stockStatus ?? "out_of_stock";
    const current = status[product.category];
    if (!current || priority[s] > priority[current]) {
      status[product.category] = s;
    }
  }

  return status;
}
