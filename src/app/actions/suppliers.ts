"use server";

import { requireAdminCustomer } from "@/lib/auth";
import {
  getReloadlyEnvironment,
  isReloadlyConfigured,
} from "@/lib/reloadly/config";
import { describeReloadlyError } from "@/lib/reloadly/client";
import {
  getGiftCardProducts,
  getGiftCardProduct,
  getAccountBalance,
  validateReloadlyDenomination,
} from "@/lib/reloadly/operations";
import {
  getReloadlyMappings,
  getMappedReloadlyProductIds,
  getReloadlyMetrics,
  getReloadlyProviderOrders,
  getReloadlyDeliveryTargets,
} from "@/lib/db/suppliers";
import { getPricingSettings } from "@/lib/db/pricing-settings";
import { isFazerCardsConfigured } from "@/lib/fazercards/config";
import { describeFazerCardsError } from "@/lib/fazercards/client";
import { getProfile as getFazerCardsProfile, getBalance as getFazerCardsBalance } from "@/lib/fazercards/operations";
import type {
  FazerCardsHealthDTO,
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
      error: describeReloadlyError("health", error),
    };
  }
}

/** Read-only FazerCards connection/auth test. Never places an order. */
export async function testFazerCardsConnectionAction(): Promise<FazerCardsHealthDTO> {
  await requireAdminCustomer();
  const checkedAt = new Date().toISOString();

  if (!isFazerCardsConfigured()) {
    return {
      ok: false,
      configured: false,
      authWorking: false,
      plan: null,
      subscriptionActive: null,
      checkedAt,
      balance: null,
      error: "FazerCards n’est pas configuré (FAZERCARDS_API_KEY manquant).",
    };
  }

  try {
    // Cheapest authenticated read that proves the key works, and surfaces the
    // subscription state (a lapsed plan 403s the catalog/order routes).
    const profile = await getFazerCardsProfile();
    let balance: FazerCardsHealthDTO["balance"] = null;
    try {
      const b = await getFazerCardsBalance();
      balance = { amount: b.balance, currency: b.currency };
    } catch {
      // Balance read is best-effort — not fatal for the health verdict.
      balance = null;
    }
    return {
      ok: true,
      configured: true,
      authWorking: true,
      plan: profile.plan,
      subscriptionActive: profile.subscriptionActive,
      checkedAt,
      balance,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      authWorking: false,
      plan: null,
      subscriptionActive: null,
      checkedAt,
      balance: null,
      error: describeFazerCardsError("health", error),
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
    return { ok: false, error: describeReloadlyError("catalog", error) };
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
    const [product, { fxRatesToMad }] = await Promise.all([
      getGiftCardProduct(productId),
      getPricingSettings(),
    ]);
    const { ok, issues, infos } = validateReloadlyDenomination(product, expected, fxRatesToMad);

    // Cross-currency cost detail: original provider cost + MAD equivalent via
    // the internal rate. Display-only — never feeds back into any price.
    const providerCurrency = product.recipientCurrencyCode?.trim().toUpperCase() ?? "";
    const crossCurrency = providerCurrency !== "" && providerCurrency !== "MAD" && providerCurrency !== "DH";
    const rate = crossCurrency ? fxRatesToMad[providerCurrency] : null;
    const hasRate = rate != null && Number.isFinite(rate) && rate > 0;
    const conversion =
      crossCurrency && hasRate && expected.faceValue != null
        ? {
            originalAmount: expected.faceValue,
            originalCurrency: providerCurrency,
            convertedMad: expected.faceValue * rate,
            rate,
          }
        : null;

    return {
      ok,
      productId,
      productName: product.productName,
      country: product.country?.isoName ?? null,
      currency: product.recipientCurrencyCode,
      denominationType: product.denominationType,
      fixedDenominations: product.fixedRecipientDenominations ?? [],
      issues,
      infos,
      conversion,
      missingRateCurrency: crossCurrency && !hasRate ? providerCurrency : null,
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
      infos: [],
      conversion: null,
      missingRateCurrency: null,
      error: describeReloadlyError(`availability:${productId}`, error),
    };
  }
}

/**
 * Pre-delivery mismatch check for the admin order page: for each Reloadly-
 * eligible line item, verify the variant's face value/currency/country against
 * the mapped Reloadly product. Returns a per-orderItem result. A Reloadly
 * outage never surfaces a false warning (fails open: ok=true, logged only).
 */
export async function getReloadlyDeliveryChecksAction(
  orderId: string,
): Promise<Record<string, { ok: boolean; message: string | null }>> {
  await requireAdminCustomer();
  const [targets, { fxRatesToMad }] = await Promise.all([
    getReloadlyDeliveryTargets(orderId),
    getPricingSettings(),
  ]);
  const result: Record<string, { ok: boolean; message: string | null }> = {};
  for (const t of targets) {
    try {
      const product = await getGiftCardProduct(t.reloadlyProductId);
      const { ok, issues } = validateReloadlyDenomination(
        product,
        {
          faceValue: t.faceValue,
          currency: t.faceCurrency,
          countryCode: t.countryCode,
        },
        fxRatesToMad,
      );
      result[t.orderItemId] = { ok, message: ok ? null : issues.join(" ") };
    } catch (error) {
      console.error("[reloadlyDeliveryChecks]", error instanceof Error ? error.message : error);
      result[t.orderItemId] = { ok: true, message: null };
    }
  }
  return result;
}
