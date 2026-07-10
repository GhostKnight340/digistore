"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import { describeReloadlyError } from "@/lib/reloadly/client";
import {
  searchReloadlyImportCatalog,
  getReloadlyImportDetail,
  previewReloadlyDenominations,
  importReloadlyProduct,
  importReloadlyBatch,
  listGhostParentOptions,
} from "@/lib/db/catalog-import";
import { getCategoryOptions } from "@/lib/db/categories";
import type {
  AdminCategoryDTO,
  GhostParentOptionDTO,
  ImportReloadlyBatchInput,
  ImportReloadlyBatchResultDTO,
  ImportReloadlyProductInput,
  ImportReloadlyResultDTO,
  ReloadlyDenominationPreviewDTO,
  ReloadlyImportDetailDTO,
  ReloadlyImportSearchPageDTO,
} from "@/lib/dto";

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
    return { ok: false, error: describeReloadlyError("import:search", error) };
  }
}

export async function getReloadlyImportDetailAction(
  productId: number,
): Promise<{ ok: true; data: ReloadlyImportDetailDTO } | { ok: false; error: string }> {
  await requireAdminCustomer();
  try {
    return { ok: true, data: await getReloadlyImportDetail(productId) };
  } catch (error) {
    return { ok: false, error: describeReloadlyError(`import:detail:${productId}`, error) };
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
    return { ok: false, error: describeReloadlyError(`import:preview:${input.productId}`, error) };
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

/** Existing Ghost parent products, for the "add to existing product" grouping (§5). */
export async function getGhostParentOptionsAction(): Promise<GhostParentOptionDTO[]> {
  await requireAdminCustomer();
  return listGhostParentOptions();
}

/** Bulk import with grouping, draft/publish, competitor fields (§1–§9). */
export async function importReloadlyBatchAction(
  input: ImportReloadlyBatchInput,
): Promise<ImportReloadlyBatchResultDTO> {
  await requireAdminCustomer();
  const result = await importReloadlyBatch(input);
  if (result.ok) {
    revalidatePath("/products");
    revalidatePath("/admin");
    for (const p of result.products) revalidatePath(`/products/${p.slug}`);
  }
  return result;
}
