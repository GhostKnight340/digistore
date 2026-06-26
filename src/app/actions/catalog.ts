"use server";

import {
  getCatalogData,
  getProductCatalog,
  getStoreSettings,
  saveStoreSettings,
} from "@/lib/db/catalog";
import type { Product } from "@/lib/types";
import type { StoreSettings } from "@/lib/storeSettings";

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
  try {
    await saveStoreSettings(settings);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Save failed.",
    };
  }
}
