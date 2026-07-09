"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import { ReloadlyApiError, ReloadlyConfigError } from "@/lib/reloadly/client";
import {
  searchReloadlyImportCatalog,
  getReloadlyImportDetail,
  previewReloadlyDenominations,
  importReloadlyProduct,
} from "@/lib/db/catalog-import";
import { getCategoryOptions } from "@/lib/db/categories";
import type {
  AdminCategoryDTO,
  ImportReloadlyProductInput,
  ImportReloadlyResultDTO,
  ReloadlyDenominationPreviewDTO,
  ReloadlyImportDetailDTO,
  ReloadlyImportSearchPageDTO,
} from "@/lib/dto";

function safeError(error: unknown): string {
  if (error instanceof ReloadlyConfigError) return error.message;
  if (error instanceof ReloadlyApiError) return error.message;
  return "Erreur lors de la communication avec Reloadly.";
}

export async function searchReloadlyImportCatalogAction(filters: {
  page?: number;
  size?: number;
  countryCode?: string;
  query?: string;
  denominationType?: "FIXED" | "RANGE";
  includeInactive?: boolean;
}): Promise<{ ok: true; data: ReloadlyImportSearchPageDTO } | { ok: false; error: string }> {
  await requireAdminCustomer();
  try {
    return { ok: true, data: await searchReloadlyImportCatalog(filters) };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function getReloadlyImportDetailAction(
  productId: number,
): Promise<{ ok: true; data: ReloadlyImportDetailDTO } | { ok: false; error: string }> {
  await requireAdminCustomer();
  try {
    return { ok: true, data: await getReloadlyImportDetail(productId) };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function previewReloadlyDenominationsAction(input: {
  productId: number;
  faceValues: number[];
  categoryId: string | null;
  marginOverride: number | null;
}): Promise<{ ok: true; data: ReloadlyDenominationPreviewDTO[] } | { ok: false; error: string }> {
  await requireAdminCustomer();
  try {
    return { ok: true, data: await previewReloadlyDenominations(input) };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function getImportCategoryOptionsAction(): Promise<AdminCategoryDTO[]> {
  await requireAdminCustomer();
  return getCategoryOptions();
}

export async function importReloadlyProductAction(
  input: ImportReloadlyProductInput,
): Promise<ImportReloadlyResultDTO> {
  await requireAdminCustomer();
  const result = await importReloadlyProduct(input);
  if (result.ok && result.productSlug) {
    // Refresh storefront + admin catalog surfaces so the new product appears.
    revalidatePath("/products");
    revalidatePath(`/products/${result.productSlug}`);
    revalidatePath("/admin");
  }
  return result;
}
