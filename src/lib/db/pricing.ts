import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { getReloadlyEnvironment } from "@/lib/reloadly/config";
import { isReloadlyConfigured } from "@/lib/reloadly/config";
import {
  getGiftCardProduct,
  buildReloadlyCostInputs,
  type ReloadlyGiftCardProduct,
} from "@/lib/reloadly/operations";
import { computeProviderCost } from "@/lib/pricing/cost";
import { resolveMargin, computeSuggestedPrice } from "@/lib/pricing/suggested-price";
import { getPricingSettings } from "./pricing-settings";
import type { PricingSettings } from "@/lib/pricing/types";
import type {
  PricingOverviewDTO,
  PricingRowDTO,
  PricingRowStatus,
  PricingSyncResultDTO,
  PublishPriceResultDTO,
  SupplierEnvironment,
} from "@/lib/dto";

const Decimal = Prisma.Decimal;

/** Stable key for matching a synced cost to a variant's (product, face value). */
function costKey(reloadlyProductId: number, faceValue: number): string {
  return `${reloadlyProductId}:${faceValue}`;
}

function toNum(value: Prisma.Decimal | number | null): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

// ─── Sync (§4) ───────────────────────────────────────────────────────────────

type MappedVariant = {
  reloadlyProductId: number;
  faceValue: number;
};

/**
 * Synchronizes provider costs from Reloadly for every mapped variant.
 *
 * - Fetches each distinct mapped Reloadly product once.
 * - Computes provider cost via the single formula (computeProviderCost).
 * - Upserts one ReloadlyProviderCost row per (environment, product, faceValue).
 * - NEVER touches ProductVariant.priceMad and never publishes a customer price.
 * - RANGE products: only the face values actually mapped by a variant are
 *   priced/stored (no arbitrary denomination explosion). FIXED products: the
 *   mapped face values plus the product's offered fixed denominations (bounded).
 * - Records a PricingSyncRun so a failed/partial sync is visible and can never
 *   be mistaken for fresh data. Environment is stamped on every row.
 */
export async function syncReloadlyProviderCosts(): Promise<PricingSyncResultDTO> {
  await ensureDatabaseReady();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;

  const run = await prisma.pricingSyncRun.create({
    data: { environment, status: "failed", productsSynced: 0, costsUpserted: 0 },
  });

  if (!isReloadlyConfigured()) {
    await prisma.pricingSyncRun.update({
      where: { id: run.id },
      data: { status: "failed", error: "Reloadly non configuré.", finishedAt: new Date() },
    });
    return {
      ok: false,
      environment,
      productsSynced: 0,
      costsUpserted: 0,
      skipped: 0,
      error: "Reloadly non configuré.",
    };
  }

  // Mapped variants only. Group their face values by Reloadly product.
  const variants = await prisma.productVariant.findMany({
    where: { stockControl: "reloadly", reloadlyProductId: { not: null }, faceValue: { not: null } },
    select: { reloadlyProductId: true, faceValue: true },
  });

  const faceValuesByProduct = new Map<number, Set<number>>();
  for (const v of variants as MappedVariant[]) {
    if (v.reloadlyProductId == null || v.faceValue == null) continue;
    const set = faceValuesByProduct.get(v.reloadlyProductId) ?? new Set<number>();
    set.add(v.faceValue);
    faceValuesByProduct.set(v.reloadlyProductId, set);
  }

  let productsSynced = 0;
  let costsUpserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [reloadlyProductId, mappedFaceValues] of faceValuesByProduct) {
    let product: ReloadlyGiftCardProduct;
    try {
      product = await getGiftCardProduct(reloadlyProductId);
    } catch (error) {
      errors.push(
        `#${reloadlyProductId}: ${error instanceof Error ? error.message : "fetch échoué"}`,
      );
      continue;
    }
    productsSynced += 1;

    // Which face values to price for this product.
    const targets = new Set<number>(mappedFaceValues);
    if (product.denominationType !== "RANGE") {
      for (const denom of product.fixedRecipientDenominations ?? []) targets.add(denom);
    }

    for (const faceValue of targets) {
      const inputs = buildReloadlyCostInputs(product, faceValue);
      if (!inputs) {
        skipped += 1;
        continue;
      }
      const { providerCost } = computeProviderCost(inputs);

      await prisma.reloadlyProviderCost.upsert({
        where: {
          environment_reloadlyProductId_recipientFaceValue: {
            environment,
            reloadlyProductId,
            recipientFaceValue: new Decimal(faceValue),
          },
        },
        update: {
          productName: inputs.productName,
          denominationType: inputs.denominationType,
          recipientCurrency: inputs.recipientCurrency,
          senderCurrency: inputs.senderCurrency,
          senderBaseCost: new Decimal(inputs.senderBase),
          discountPercentage: new Decimal(inputs.discountPercentage),
          senderFee: new Decimal(inputs.senderFee),
          senderFeePercentage: new Decimal(inputs.senderFeePercentage),
          recipientToSenderExchangeRate:
            inputs.recipientToSenderExchangeRate != null
              ? new Decimal(inputs.recipientToSenderExchangeRate)
              : null,
          computedProviderCost: providerCost,
          syncedAt: new Date(),
        },
        create: {
          environment,
          reloadlyProductId,
          productName: inputs.productName,
          denominationType: inputs.denominationType,
          recipientFaceValue: new Decimal(faceValue),
          recipientCurrency: inputs.recipientCurrency,
          senderCurrency: inputs.senderCurrency,
          senderBaseCost: new Decimal(inputs.senderBase),
          discountPercentage: new Decimal(inputs.discountPercentage),
          senderFee: new Decimal(inputs.senderFee),
          senderFeePercentage: new Decimal(inputs.senderFeePercentage),
          recipientToSenderExchangeRate:
            inputs.recipientToSenderExchangeRate != null
              ? new Decimal(inputs.recipientToSenderExchangeRate)
              : null,
          computedProviderCost: providerCost,
        },
      });
      costsUpserted += 1;
    }
  }

  const status = errors.length === 0 ? "success" : productsSynced > 0 ? "partial" : "failed";
  const error = errors.length > 0 ? errors.slice(0, 5).join(" | ") : null;
  await prisma.pricingSyncRun.update({
    where: { id: run.id },
    data: { status, productsSynced, costsUpserted, error, finishedAt: new Date() },
  });

  return {
    ok: status !== "failed",
    environment,
    productsSynced,
    costsUpserted,
    skipped,
    error,
  };
}

// ─── Suggestion + overview (§7, §9) ──────────────────────────────────────────

type VariantRow = Prisma.ProductVariantGetPayload<{
  select: {
    id: true;
    name: true;
    priceMad: true;
    faceValue: true;
    faceCurrency: true;
    active: true;
    stockControl: true;
    reloadlyProductId: true;
    reloadlyCountryCode: true;
    marginPctOverride: true;
    fixedSuggestedPriceMad: true;
    product: {
      select: {
        id: true;
        name: true;
        region: true;
        category: true;
        marginPctOverride: true;
        categoryRecord: { select: { marginPctOverride: true } };
      };
    };
  };
}>;

type CostRow = Prisma.ReloadlyProviderCostGetPayload<{}>;

function variantLabel(v: { name: string; faceValue: number | null; faceCurrency: string }): string {
  return v.faceValue != null ? `${v.faceValue} ${v.faceCurrency}` : v.name;
}

/**
 * Builds one pricing row: resolves margin, computes the suggested price, and
 * classifies drift/health status. Pure given its inputs — shared by the admin
 * overview and the publish path so both agree on the number.
 */
function buildPricingRow(
  v: VariantRow,
  cost: CostRow | undefined,
  settings: PricingSettings,
  environment: SupplierEnvironment,
): PricingRowDTO {
  const variantMarginPct = toNum(v.marginPctOverride);
  const productMarginPct = toNum(v.product.marginPctOverride);
  const categoryMarginPct = toNum(v.product.categoryRecord?.marginPctOverride ?? null);
  const variantFixedPriceMad = v.fixedSuggestedPriceMad ?? null;

  const base: PricingRowDTO = {
    variantId: v.id,
    productId: v.product.id,
    productName: v.product.name,
    variantLabel: variantLabel(v),
    region: v.product.region,
    categoryId: v.product.category,
    faceValue: v.faceValue,
    faceCurrency: v.faceCurrency,
    reloadlyProductId: v.reloadlyProductId,
    reloadlyCountryCode: v.reloadlyCountryCode,
    environment,
    providerCost: null,
    supplierCurrency: null,
    fxRateToMad: null,
    costInMad: null,
    costSyncedAt: null,
    marginSource: null,
    marginPct: null,
    rawPriceMad: null,
    suggestedPriceMad: null,
    publishedPriceMad: v.priceMad,
    differenceMad: null,
    differencePct: null,
    expectedGrossProfitMad: null,
    expectedGrossMarginPct: null,
    variantMarginPct,
    productMarginPct,
    categoryMarginPct,
    variantFixedPriceMad,
    status: "missing_cost",
  };

  // Invalid mapping: opted into Reloadly but the mapping is incomplete.
  if (v.stockControl === "reloadly" && (v.reloadlyProductId == null || !v.reloadlyCountryCode)) {
    return { ...base, status: "invalid_mapping" };
  }

  const margin = resolveMargin({
    variantFixedPriceMad,
    variantMarginPct,
    productMarginPct,
    categoryMarginPct,
    defaultMarginPct: settings.defaultMarginPct,
  });

  // A fixed-price override can produce a suggestion even with no synced cost.
  const hasCost = !!cost;
  const supplierCurrency = cost ? cost.senderCurrency : null;
  const providerCost = cost ? Number(cost.computedProviderCost) : null;
  const fxRateToMad =
    supplierCurrency != null ? settings.fxRatesToMad[supplierCurrency.toUpperCase()] ?? null : null;

  if (!hasCost && margin.source !== "variant_fixed_price") {
    return { ...base, status: "missing_cost" };
  }

  const outcome = computeSuggestedPrice({
    providerCost: providerCost ?? 0,
    supplierCurrency: supplierCurrency ?? "",
    fxRateToMad,
    margin,
    roundingIncrement: settings.roundingIncrement,
    roundingMode: settings.roundingMode,
    publishedPriceMad: v.priceMad,
  });

  if (!outcome.ok) {
    return {
      ...base,
      providerCost,
      supplierCurrency,
      costSyncedAt: cost ? cost.syncedAt.toISOString() : null,
      status: "missing_fx",
    };
  }

  const b = outcome.breakdown;
  const costInMad = hasCost && fxRateToMad != null ? b.costInMad : null;
  const expectedGrossProfitMad = costInMad != null ? Number((v.priceMad - costInMad).toFixed(2)) : null;
  const expectedGrossMarginPct =
    expectedGrossProfitMad != null && v.priceMad !== 0
      ? Number(((expectedGrossProfitMad / v.priceMad) * 100).toFixed(2))
      : null;

  const status: PricingRowStatus =
    b.suggestedPriceMad === v.priceMad ? "up_to_date" : "changed";

  return {
    ...base,
    providerCost,
    supplierCurrency,
    fxRateToMad,
    costInMad,
    costSyncedAt: cost ? cost.syncedAt.toISOString() : null,
    marginSource: b.marginSource,
    marginPct: b.marginPct,
    rawPriceMad: b.rawPriceMad,
    suggestedPriceMad: b.suggestedPriceMad,
    differenceMad: b.differenceMad,
    differencePct: b.differencePct,
    expectedGrossProfitMad,
    expectedGrossMarginPct,
    status,
  };
}

async function loadPricingRows(
  settings: PricingSettings,
  environment: SupplierEnvironment,
): Promise<PricingRowDTO[]> {
  const variantSelect = {
    id: true,
    name: true,
    priceMad: true,
    faceValue: true,
    faceCurrency: true,
    active: true,
    stockControl: true,
    reloadlyProductId: true,
    reloadlyCountryCode: true,
    marginPctOverride: true,
    fixedSuggestedPriceMad: true,
    product: {
      select: {
        id: true,
        name: true,
        region: true,
        category: true,
        marginPctOverride: true,
        categoryRecord: { select: { marginPctOverride: true } },
      },
    },
  } satisfies Prisma.ProductVariantSelect;

  // Reloadly-mapped variants are the pricing surface for Phase 1.
  const variants = await prisma.productVariant.findMany({
    where: { stockControl: "reloadly" },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    select: variantSelect,
  });

  const costs = await prisma.reloadlyProviderCost.findMany({ where: { environment } });
  const costByKey = new Map<string, CostRow>();
  for (const c of costs) {
    costByKey.set(costKey(c.reloadlyProductId, Number(c.recipientFaceValue)), c);
  }

  return variants.map((v) => {
    const cost =
      v.reloadlyProductId != null && v.faceValue != null
        ? costByKey.get(costKey(v.reloadlyProductId, v.faceValue))
        : undefined;
    return buildPricingRow(v as VariantRow, cost, settings, environment);
  });
}

export async function getPricingOverview(): Promise<PricingOverviewDTO> {
  await ensureDatabaseReady();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;
  const settings = await getPricingSettings();
  const rows = await loadPricingRows(settings, environment);

  const lastRun = await prisma.pricingSyncRun.findFirst({
    where: { environment },
    orderBy: { startedAt: "desc" },
  });

  return {
    environment,
    configured: isReloadlyConfigured(),
    settings,
    rows,
    lastSync: lastRun
      ? {
          environment: lastRun.environment as SupplierEnvironment,
          status: lastRun.status as "success" | "partial" | "failed",
          productsSynced: lastRun.productsSynced,
          costsUpserted: lastRun.costsUpserted,
          error: lastRun.error,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt ? lastRun.finishedAt.toISOString() : null,
        }
      : null,
  };
}

// ─── Publish (§8) — explicit, never automatic ────────────────────────────────

/**
 * Publishes a variant's currently-suggested price into ProductVariant.priceMad.
 * Recomputes the suggestion server-side (never trusts a client-sent number) and
 * refuses to publish rows without a computable suggestion. This is the ONLY
 * function in the pricing subsystem that writes priceMad.
 */
export async function publishSuggestedPrice(variantId: string): Promise<PublishPriceResultDTO> {
  await ensureDatabaseReady();
  const environment = getReloadlyEnvironment() as SupplierEnvironment;
  const settings = await getPricingSettings();

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      name: true,
      priceMad: true,
      faceValue: true,
      faceCurrency: true,
      active: true,
      stockControl: true,
      reloadlyProductId: true,
      reloadlyCountryCode: true,
      marginPctOverride: true,
      fixedSuggestedPriceMad: true,
      product: {
        select: {
          id: true,
          name: true,
          region: true,
          category: true,
          marginPctOverride: true,
          categoryRecord: { select: { marginPctOverride: true } },
        },
      },
    },
  });
  if (!variant) {
    return { ok: false, variantId, publishedPriceMad: null, error: "Variante introuvable." };
  }

  const cost =
    variant.reloadlyProductId != null && variant.faceValue != null
      ? (await prisma.reloadlyProviderCost.findUnique({
          where: {
            environment_reloadlyProductId_recipientFaceValue: {
              environment,
              reloadlyProductId: variant.reloadlyProductId,
              recipientFaceValue: new Decimal(variant.faceValue),
            },
          },
        })) ?? undefined
      : undefined;

  const row = buildPricingRow(variant as VariantRow, cost, settings, environment);
  if (row.suggestedPriceMad == null) {
    return {
      ok: false,
      variantId,
      publishedPriceMad: null,
      error: "Aucun prix suggéré calculable (coût ou taux de change manquant).",
    };
  }

  await prisma.productVariant.update({
    where: { id: variantId },
    data: { priceMad: row.suggestedPriceMad },
  });

  return { ok: true, variantId, publishedPriceMad: row.suggestedPriceMad, error: null };
}

export async function publishSuggestedPrices(
  variantIds: string[],
): Promise<PublishPriceResultDTO[]> {
  const results: PublishPriceResultDTO[] = [];
  for (const id of variantIds) {
    results.push(await publishSuggestedPrice(id));
  }
  return results;
}

// ─── Policy override writes (§6/§8) ──────────────────────────────────────────

export async function setVariantPricingOverrides(
  variantId: string,
  overrides: { marginPctOverride?: number | null; fixedSuggestedPriceMad?: number | null },
): Promise<void> {
  await ensureDatabaseReady();
  await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      ...(overrides.marginPctOverride !== undefined
        ? {
            marginPctOverride:
              overrides.marginPctOverride == null ? null : new Decimal(overrides.marginPctOverride),
          }
        : {}),
      ...(overrides.fixedSuggestedPriceMad !== undefined
        ? { fixedSuggestedPriceMad: overrides.fixedSuggestedPriceMad }
        : {}),
    },
  });
}

export async function setProductMarginOverride(
  productId: string,
  marginPct: number | null,
): Promise<void> {
  await ensureDatabaseReady();
  await prisma.product.update({
    where: { id: productId },
    data: { marginPctOverride: marginPct == null ? null : new Decimal(marginPct) },
  });
}

export async function setCategoryMarginOverride(
  categoryId: string,
  marginPct: number | null,
): Promise<void> {
  await ensureDatabaseReady();
  await prisma.category.update({
    where: { id: categoryId },
    data: { marginPctOverride: marginPct == null ? null : new Decimal(marginPct) },
  });
}

// ─── Fulfillment cost reconciliation (§10) ───────────────────────────────────

/**
 * Records estimated-vs-actual provider cost after a real Reloadly order.
 * Estimated cost comes from the synced ReloadlyProviderCost for the same
 * environment/product/face value; actual is Reloadly's balanceInfo.cost. This
 * is append-only audit data — it NEVER feeds back into any customer price and
 * is never exposed to customers. Best-effort: never throws into fulfillment.
 */
export async function recordReloadlyCostReconciliation(input: {
  orderId: string;
  deliveredCodeId?: string | null;
  reloadlyTransactionId?: number | null;
  reloadlyProductId: number;
  recipientFaceValue: number | null;
  actualProviderCost: number;
  currency: string;
}): Promise<void> {
  try {
    const environment = getReloadlyEnvironment();
    let estimated: Prisma.Decimal | null = null;
    if (input.recipientFaceValue != null) {
      const cost = await prisma.reloadlyProviderCost.findUnique({
        where: {
          environment_reloadlyProductId_recipientFaceValue: {
            environment,
            reloadlyProductId: input.reloadlyProductId,
            recipientFaceValue: new Decimal(input.recipientFaceValue),
          },
        },
        select: { computedProviderCost: true },
      });
      estimated = cost ? cost.computedProviderCost : null;
    }
    const actual = new Decimal(input.actualProviderCost);
    const difference = estimated != null ? actual.minus(estimated) : null;

    await prisma.reloadlyCostReconciliation.create({
      data: {
        orderId: input.orderId,
        deliveredCodeId: input.deliveredCodeId ?? null,
        reloadlyTransactionId: input.reloadlyTransactionId ?? null,
        environment,
        reloadlyProductId: input.reloadlyProductId,
        recipientFaceValue:
          input.recipientFaceValue != null ? new Decimal(input.recipientFaceValue) : null,
        estimatedProviderCost: estimated,
        actualProviderCost: actual,
        currency: input.currency,
        differenceAmount: difference,
      },
    });
  } catch (error) {
    console.error("[pricing:reconciliation]", error instanceof Error ? error.message : error);
  }
}
