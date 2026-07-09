"use server";

import { requireAdminCustomer } from "@/lib/auth";
import {
  getPricingOverview,
  syncReloadlyProviderCosts,
  publishSuggestedPrice,
  publishSuggestedPrices,
  setVariantPricingOverrides,
  setProductMarginOverride,
  setCategoryMarginOverride,
} from "@/lib/db/pricing";
import { savePricingSettings } from "@/lib/db/pricing-settings";
import type { PricingSettings } from "@/lib/pricing/types";
import type {
  PricingOverviewDTO,
  PricingSettingsDTO,
  PricingSyncResultDTO,
  PublishPriceResultDTO,
} from "@/lib/dto";

export async function getPricingOverviewAction(): Promise<PricingOverviewDTO> {
  await requireAdminCustomer();
  return getPricingOverview();
}

/**
 * Runs a provider-cost sync. Read-only against ProductVariant.priceMad — it
 * only writes into the ReloadlyProviderCost / PricingSyncRun cost layer. Uses
 * whatever RELOADLY_ENV is configured; sandbox and live costs are stored
 * separately, so a sandbox run can never overwrite live cost data.
 */
export async function runReloadlyCostSyncAction(): Promise<PricingSyncResultDTO> {
  await requireAdminCustomer();
  return syncReloadlyProviderCosts();
}

export async function savePricingSettingsAction(
  input: PricingSettingsDTO,
): Promise<PricingSettingsDTO> {
  await requireAdminCustomer();
  return savePricingSettings(input as PricingSettings);
}

/** Explicit, admin-triggered publish of a single variant's suggested price. */
export async function publishSuggestedPriceAction(
  variantId: string,
): Promise<PublishPriceResultDTO> {
  await requireAdminCustomer();
  return publishSuggestedPrice(variantId);
}

/** Explicit, admin-triggered bulk publish. */
export async function publishSuggestedPricesAction(
  variantIds: string[],
): Promise<PublishPriceResultDTO[]> {
  await requireAdminCustomer();
  return publishSuggestedPrices(variantIds);
}

export async function setVariantPricingOverridesAction(
  variantId: string,
  overrides: { marginPctOverride?: number | null; fixedSuggestedPriceMad?: number | null },
): Promise<{ ok: true }> {
  await requireAdminCustomer();
  await setVariantPricingOverrides(variantId, overrides);
  return { ok: true };
}

export async function setProductMarginOverrideAction(
  productId: string,
  marginPct: number | null,
): Promise<{ ok: true }> {
  await requireAdminCustomer();
  await setProductMarginOverride(productId, marginPct);
  return { ok: true };
}

export async function setCategoryMarginOverrideAction(
  categoryId: string,
  marginPct: number | null,
): Promise<{ ok: true }> {
  await requireAdminCustomer();
  await setCategoryMarginOverride(categoryId, marginPct);
  return { ok: true };
}
