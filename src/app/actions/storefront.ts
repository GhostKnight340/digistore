"use server";

import {
  getStorefrontProducts,
  getStorefrontProduct,
  getStorefrontFeatured,
  getStorefrontProductsByIds,
  getCategoryCounts,
} from "@/lib/db/storefront";
import type { Product } from "@/lib/types";

export async function getStorefrontProductsAction(): Promise<Product[]> {
  return getStorefrontProducts();
}

export async function getStorefrontProductAction(slug: string): Promise<Product | null> {
  return getStorefrontProduct(slug);
}

export async function getStorefrontFeaturedAction(): Promise<Product[]> {
  return getStorefrontFeatured();
}

export async function getStorefrontProductsByIdsAction(slugs: string[]): Promise<Product[]> {
  return getStorefrontProductsByIds(slugs);
}

export async function getCategoryCountsAction(): Promise<Record<string, number>> {
  return getCategoryCounts();
}
