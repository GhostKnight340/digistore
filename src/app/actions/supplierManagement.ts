"use server";

/**
 * Admin actions for the /admin/suppliers section. Every action requires an
 * admin session, goes through the provider registry (no supplier-specific
 * logic here), and never returns credentials — only env-var names + set flags.
 */
import { requireAdminCustomer } from "@/lib/auth";
import {
  getSupplierProvider,
  isSupplierSlug,
} from "@/lib/suppliers/registry";
import {
  getSupplierDetail,
  listSupplierCards,
  listSupplierLogs,
  recordSupplierBalance,
  recordSupplierCheck,
  recordSupplierLog,
  setSupplierEnabled,
} from "@/lib/db/supplierManagement";
import type {
  ActionResult,
  SupplierBalanceResultDTO,
  SupplierCardDTO,
  SupplierDetailDTO,
  SupplierLogFilters,
  SupplierLogsPageDTO,
  SupplierTestResultDTO,
} from "@/lib/dto";

export async function getSuppliersOverviewAction(): Promise<SupplierCardDTO[]> {
  await requireAdminCustomer();
  return listSupplierCards();
}

export async function getSupplierDetailAction(slug: string): Promise<SupplierDetailDTO | null> {
  await requireAdminCustomer();
  return getSupplierDetail(slug);
}

/**
 * "Test Connection": read-only auth/availability/permission check with
 * response-time measurement. Never places an order. Outcome is logged and
 * rolls the supplier's health state forward.
 */
export async function testSupplierConnectionAction(slug: string): Promise<SupplierTestResultDTO> {
  await requireAdminCustomer();
  const checkedAt = new Date().toISOString();
  if (!isSupplierSlug(slug)) {
    return { ok: false, message: "Fournisseur inconnu.", responseTimeMs: 0, checkedAt, details: [] };
  }
  const provider = getSupplierProvider(slug);
  const result = await provider.testConnection();
  await recordSupplierCheck(slug);
  void recordSupplierLog({
    slug,
    requestType: "health_check",
    ok: result.ok,
    responseTimeMs: result.responseTimeMs,
    errorMessage: result.ok ? null : result.message,
  });
  return { ...result, checkedAt };
}

/** Refreshes the cached wallet balance (read-only). */
export async function refreshSupplierBalanceAction(slug: string): Promise<SupplierBalanceResultDTO> {
  await requireAdminCustomer();
  if (!isSupplierSlug(slug)) {
    return { ok: false, balance: null, message: "Fournisseur inconnu." };
  }
  const provider = getSupplierProvider(slug);
  if (!provider.supportsBalance || !provider.getBalance) {
    return {
      ok: false,
      balance: null,
      message: "Ce fournisseur n’expose pas de solde via son API.",
    };
  }
  if (!provider.isConfigured()) {
    return { ok: false, balance: null, message: "Fournisseur non configuré." };
  }
  const startedAt = Date.now();
  try {
    const balance = await provider.getBalance();
    const updatedAt = new Date().toISOString();
    await recordSupplierBalance(slug, balance);
    void recordSupplierLog({
      slug,
      requestType: "balance",
      ok: true,
      responseTimeMs: Date.now() - startedAt,
    });
    return { ok: true, balance: { ...balance, updatedAt }, message: null };
  } catch (error) {
    // Providers wrap their own errors in admin-safe messages; anything else
    // is logged server-side and replaced with a generic notice.
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Impossible de récupérer le solde.";
    console.error(`[suppliers:${slug}:balance]`, error);
    void recordSupplierLog({
      slug,
      requestType: "balance",
      ok: false,
      responseTimeMs: Date.now() - startedAt,
      errorMessage: message,
    });
    return { ok: false, balance: null, message };
  }
}

/**
 * Enable/disable a supplier. Disabled suppliers are refused by deliverOrder
 * (the money path) and shown as disabled everywhere in the admin. The UI asks
 * for confirmation before disabling; this action is the enforcement point.
 */
export async function setSupplierEnabledAction(
  slug: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requireAdminCustomer();
  return setSupplierEnabled(slug, enabled);
}

export async function getSupplierLogsAction(
  slug: string,
  filters: SupplierLogFilters,
): Promise<SupplierLogsPageDTO> {
  await requireAdminCustomer();
  return listSupplierLogs(slug, filters);
}
