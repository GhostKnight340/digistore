"use server";

/**
 * Server actions for the Operations dashboard (/admin/operations). Every action
 * requires an admin session. The snapshot read is cheap and cache-friendly
 * (no live provider calls); the quick actions that DO hit providers
 * (test/refresh) are explicit, admin-triggered, and reuse the existing
 * supplier-management actions so there is no duplicated provider logic.
 */
import { requireAdminCustomer } from "@/lib/auth";
import { getStoreSettings, saveStoreSettings } from "@/lib/db/catalog";
import { getOperationsSnapshot } from "@/lib/ops/dashboard";
import {
  refreshSupplierBalanceAction,
  testSupplierConnectionAction,
} from "@/app/actions/supplierManagement";
import { SUPPLIER_SLUGS } from "@/lib/suppliers/registry";
import { revalidatePath, revalidateTag } from "next/cache";
import { STORE_SETTINGS_TAG } from "@/lib/cacheTags";
import type { ActionResult, OperationsSnapshotDTO } from "@/lib/dto";

export async function getOperationsSnapshotAction(): Promise<OperationsSnapshotDTO> {
  await requireAdminCustomer();
  return getOperationsSnapshot();
}

/**
 * Live health refresh across all configured suppliers (explicit action —
 * this DOES call provider APIs). Returns nothing sensitive; the caller
 * re-reads the snapshot afterwards.
 */
export async function refreshAllSupplierHealthAction(): Promise<{ tested: number }> {
  await requireAdminCustomer();
  let tested = 0;
  for (const slug of SUPPLIER_SLUGS) {
    await testSupplierConnectionAction(slug);
    tested += 1;
  }
  return { tested };
}

/** Live balance refresh across all balance-supporting suppliers. */
export async function refreshAllSupplierBalancesAction(): Promise<{ refreshed: number }> {
  await requireAdminCustomer();
  let refreshed = 0;
  for (const slug of SUPPLIER_SLUGS) {
    const result = await refreshSupplierBalanceAction(slug);
    if (result.ok) refreshed += 1;
  }
  return { refreshed };
}

/**
 * Toggle maintenance mode. Destructive-ish (takes the storefront down), so the
 * UI confirms before calling. Reads current settings, flips the flag, saves.
 */
export async function toggleMaintenanceAction(enabled: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  try {
    const settings = await getStoreSettings();
    await saveStoreSettings({
      ...settings,
      maintenance: { ...settings.maintenance, enabled },
    });
    revalidateTag(STORE_SETTINGS_TAG);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Modification impossible.",
    };
  }
}
