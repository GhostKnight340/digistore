"use server";

import { requireAdminCustomer } from "@/lib/auth";
import {
  getReloadlyEnvironment,
  isReloadlyConfigured,
} from "@/lib/reloadly/config";
import { ReloadlyApiError, ReloadlyConfigError } from "@/lib/reloadly/client";
import {
  getGiftCardProducts,
  getGiftCardProduct,
  getAccountBalance,
} from "@/lib/reloadly/operations";
import {
  getReloadlyMappings,
  getMappedReloadlyProductIds,
  getReloadlyMetrics,
  getReloadlyProviderOrders,
} from "@/lib/db/suppliers";
import type {
  ReloadlyAvailabilityDTO,
  ReloadlyCatalogPageDTO,
  ReloadlyHealthDTO,
  ReloadlyMappingDTO,
  ReloadlyMetricsDTO,
  ReloadlyOverviewDTO,
  ReloadlyProviderOrderDTO,
  SupplierEnvironment,
  SupplierTimeRange,
} from "@/lib/dto";

/** Only ever surface a safe, credential-free message to the admin UI. */
function safeReloadlyError(error: unknown): string {
  if (error instanceof ReloadlyConfigError) return error.message;
  if (error instanceof ReloadlyApiError) return error.message;
  return "Erreur lors de la communication avec Reloadly.";
}

export async function getReloadlyOverviewAction(): Promise<ReloadlyOverviewDTO> {
  await requireAdminCustomer();
  return {
    configured: isReloadlyConfigured(),
    environment: getReloadlyEnvironment() as SupplierEnvironment,
    // Delivery is admin-triggered; Reloadly gift cards is synchronous (no webhook).
    automaticFulfillment: false,
    webhook: "not_applicable",
  };
}

/** Read-only connection/auth test. Never places an order. */
export async function testReloadlyConnectionAction(): Promise<ReloadlyHealthDTO> {
  await requireAdminCustomer();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;
  const checkedAt = new Date().toISOString();

  if (!isReloadlyConfigured()) {
    return {
      ok: false,
      configured: false,
      authWorking: false,
      environment,
      checkedAt,
      balance: null,
      error: "Reloadly n’est pas configuré (identifiants manquants).",
    };
  }

  try {
    // Cheapest authenticated read that proves the token flow works.
    await getGiftCardProducts({ size: 1 });
    let balance: ReloadlyHealthDTO["balance"] = null;
    try {
      const b = await getAccountBalance();
      balance = { amount: b.balance, currency: b.currencyCode };
    } catch {
      // Balance may be unavailable for this account/permission — not fatal.
      balance = null;
    }
    return { ok: true, configured: true, authWorking: true, environment, checkedAt, balance, error: null };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      authWorking: false,
      environment,
      checkedAt,
      balance: null,
      error: safeReloadlyError(error),
    };
  }
}

export async function getReloadlyMetricsAction(
  range: SupplierTimeRange,
): Promise<ReloadlyMetricsDTO> {
  await requireAdminCustomer();
  return getReloadlyMetrics(range);
}

export async function getReloadlyMappingsAction(): Promise<ReloadlyMappingDTO[]> {
  await requireAdminCustomer();
  return getReloadlyMappings();
}

export async function getReloadlyProviderOrdersAction(
  range?: SupplierTimeRange,
): Promise<ReloadlyProviderOrderDTO[]> {
  await requireAdminCustomer();
  return getReloadlyProviderOrders(range);
}

/** Read-only catalog search. Country filter is server-side; name filter is
 * applied within the returned page (Reloadly's API has no name parameter). */
export async function searchReloadlyCatalogAction(input: {
  page?: number;
  size?: number;
  countryCode?: string;
  query?: string;
}): Promise<{ ok: true; data: ReloadlyCatalogPageDTO } | { ok: false; error: string }> {
  await requireAdminCustomer();
  try {
    const [pageData, mappedIds] = await Promise.all([
      getGiftCardProducts({
        page: input.page ?? 0,
        size: input.size ?? 20,
        countryCode: input.countryCode?.trim() || undefined,
      }),
      getMappedReloadlyProductIds(),
    ]);
    const mapped = new Set(mappedIds);
    let products = pageData.content.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      brandName: p.brand?.brandName ?? "",
      country: p.country?.isoName ?? "",
      countryName: p.country?.name ?? "",
      currency: p.recipientCurrencyCode,
      denominationType: p.denominationType,
      fixedDenominations: p.fixedRecipientDenominations ?? [],
      minDenomination: p.minRecipientDenomination,
      maxDenomination: p.maxRecipientDenomination,
      mapped: mapped.has(p.productId),
    }));
    const q = input.query?.trim().toLowerCase();
    if (q) {
      products = products.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) || p.brandName.toLowerCase().includes(q),
      );
    }
    return {
      ok: true,
      data: {
        products,
        page: pageData.number,
        totalPages: pageData.totalPages,
        totalElements: pageData.totalElements,
      },
    };
  } catch (error) {
    return { ok: false, error: safeReloadlyError(error) };
  }
}

/** Read-only: validate a Reloadly product against a Ghost variant's expected
 * currency / country / denomination. Places no order. */
export async function testReloadlyAvailabilityAction(
  productId: number,
  expected: { faceValue: number | null; currency: string | null; countryCode: string | null },
): Promise<ReloadlyAvailabilityDTO> {
  await requireAdminCustomer();
  try {
    const product = await getGiftCardProduct(productId);
    const issues: string[] = [];

    if (expected.currency && product.recipientCurrencyCode !== expected.currency) {
      issues.push(
        `Devise attendue ${expected.currency}, produit en ${product.recipientCurrencyCode}.`,
      );
    }
    if (expected.countryCode && product.country?.isoName !== expected.countryCode) {
      issues.push(
        `Pays attendu ${expected.countryCode}, produit ${product.country?.isoName ?? "?"}.`,
      );
    }
    if (expected.faceValue != null) {
      if (product.denominationType === "FIXED") {
        const denoms = product.fixedRecipientDenominations ?? [];
        if (!denoms.includes(expected.faceValue)) {
          issues.push(
            `La valeur ${expected.faceValue} n’est pas proposée (disponibles : ${denoms.join(", ") || "aucune"}).`,
          );
        }
      } else {
        const min = product.minRecipientDenomination;
        const max = product.maxRecipientDenomination;
        if ((min != null && expected.faceValue < min) || (max != null && expected.faceValue > max)) {
          issues.push(`La valeur ${expected.faceValue} est hors de la plage ${min ?? "?"}–${max ?? "?"}.`);
        }
      }
    }

    return {
      ok: issues.length === 0,
      productId,
      productName: product.productName,
      country: product.country?.isoName ?? null,
      currency: product.recipientCurrencyCode,
      denominationType: product.denominationType,
      fixedDenominations: product.fixedRecipientDenominations ?? [],
      issues,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      productId,
      productName: null,
      country: null,
      currency: null,
      denominationType: null,
      fixedDenominations: [],
      issues: [],
      error: safeReloadlyError(error),
    };
  }
}
