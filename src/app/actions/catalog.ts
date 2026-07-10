"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG, STORE_SETTINGS_TAG } from "@/lib/cacheTags";
import {
  getCatalogData,
  getProductCatalog,
  getStoreSettings,
  saveStoreSettings,
  updateProductCatalogItem,
} from "@/lib/db/catalog";
import type { Product } from "@/lib/types";
import type { StoreSettings } from "@/lib/storeSettings";
import { requireAdminCustomer } from "@/lib/auth";

export async function getCatalogDataAction() {
  return getCatalogData();
}

export async function getProductCatalogAction(): Promise<Product[]> {
  return getProductCatalog();
}

export async function getStoreSettingsAction(): Promise<StoreSettings> {
  return getStoreSettings();
}

export async function saveStoreSettingsAction(
  settings: StoreSettings,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminCustomer();
  try {
    await saveStoreSettings(settings);
    // Settings feed catalog visibility/pricing, so this tag also refreshes the
    // catalog caches (they carry the settings tag).
    revalidateTag(STORE_SETTINGS_TAG);
    revalidatePath("/", "layout");
    revalidatePath("/admin/editor");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Enregistrement impossible.",
    };
  }
}

export async function updateProductCatalogItemAction(
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
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminCustomer();
  try {
    await updateProductCatalogItem(slug, data);
    revalidateTag(CATALOG_TAG);
    revalidatePath("/", "layout");
    revalidatePath("/products", "page");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Enregistrement du produit impossible.",
    };
  }
}
