/**
 * Suggested-price engine — pure and testable (no `server-only`).
 *
 * Pipeline:
 *   provider cost (sender currency)
 *     → × internal FX rate            → cost in MAD
 *     → × (1 + margin/100)            → raw MAD price
 *     → rounding rule                 → suggested MAD price (integer)
 *
 * A variant fixed-price override short-circuits the whole pipeline: the
 * suggestion IS that pinned MAD amount. Nothing here ever writes a price — it
 * only computes what to *suggest*; publishing is an explicit, separate action.
 */
import { Prisma } from "@prisma/client";
import type {
  MarginPolicyInputs,
  ResolvedMargin,
  RoundingIncrement,
  RoundingMode,
  SuggestedPriceBreakdown,
} from "./types";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * Resolves the margin ladder — most specific wins:
 *   1. variant fixed-price override  (pins the price; bypasses cost/FX/margin/rounding)
 *   2. variant margin %
 *   3. product margin %
 *   4. category margin %
 *   5. global default margin %
 * A null/undefined override is "not set" and falls through. A margin of 0 is a
 * real value and does NOT fall through.
 */
export function resolveMargin(inputs: MarginPolicyInputs): ResolvedMargin {
  if (inputs.variantFixedPriceMad != null) {
    return { source: "variant_fixed_price", fixedPriceMad: inputs.variantFixedPriceMad };
  }
  if (inputs.variantMarginPct != null) {
    return { source: "variant", marginPct: inputs.variantMarginPct };
  }
  if (inputs.productMarginPct != null) {
    return { source: "product", marginPct: inputs.productMarginPct };
  }
  if (inputs.categoryMarginPct != null) {
    return { source: "category", marginPct: inputs.categoryMarginPct };
  }
  return { source: "global_default", marginPct: inputs.defaultMarginPct };
}

/** Applies the rounding rule to a raw MAD Decimal, returning an integer MAD amount. */
export function applyRounding(
  rawMad: Decimal,
  increment: RoundingIncrement,
  mode: RoundingMode,
): number {
  const inc = new Decimal(increment);
  const steps = rawMad.div(inc);
  const roundedSteps =
    mode === "up"
      ? steps.toDecimalPlaces(0, Decimal.ROUND_CEIL)
      : steps.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return roundedSteps.mul(inc).toNumber();
}

export type SuggestedPriceParams = {
  /** Provider cost in supplier/sender currency (e.g. EUR). */
  providerCost: number | string | Decimal;
  supplierCurrency: string;
  /** MAD per 1 unit of supplierCurrency, from admin settings. Required unless a fixed override applies. */
  fxRateToMad: number | null;
  margin: ResolvedMargin;
  roundingIncrement: RoundingIncrement;
  roundingMode: RoundingMode;
  /** Currently published price, for the delta. Null when unpublished. */
  publishedPriceMad: number | null;
};

export type SuggestedPriceOutcome =
  | { ok: true; breakdown: SuggestedPriceBreakdown }
  | { ok: false; reason: "missing_fx_rate"; supplierCurrency: string };

function d(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/**
 * Computes the full suggested-price breakdown. Returns a typed failure when the
 * supplier currency has no configured internal FX rate (so the caller shows
 * "missing cost/FX data" rather than inventing a price).
 */
export function computeSuggestedPrice(params: SuggestedPriceParams): SuggestedPriceOutcome {
  const providerCost = d(params.providerCost);

  // Fixed-price override: the suggestion is exactly the pinned amount.
  if (params.margin.source === "variant_fixed_price") {
    const suggested = params.margin.fixedPriceMad;
    return {
      ok: true,
      breakdown: withDelta(
        {
          providerCost: providerCost.toNumber(),
          supplierCurrency: params.supplierCurrency,
          fxRateToMad: params.fxRateToMad ?? 0,
          costInMad: params.fxRateToMad != null ? providerCost.mul(params.fxRateToMad).toNumber() : 0,
          marginSource: "variant_fixed_price",
          marginPct: null,
          rawPriceMad: suggested,
          roundingIncrement: params.roundingIncrement,
          roundingMode: params.roundingMode,
          suggestedPriceMad: suggested,
        },
        params.publishedPriceMad,
      ),
    };
  }

  if (params.fxRateToMad == null) {
    return { ok: false, reason: "missing_fx_rate", supplierCurrency: params.supplierCurrency };
  }

  const costInMad = providerCost.mul(params.fxRateToMad);
  const marginPct = params.margin.marginPct;
  const rawPrice = costInMad.mul(new Decimal(100).plus(marginPct).div(100));
  const suggested = applyRounding(rawPrice, params.roundingIncrement, params.roundingMode);

  return {
    ok: true,
    breakdown: withDelta(
      {
        providerCost: providerCost.toNumber(),
        supplierCurrency: params.supplierCurrency,
        fxRateToMad: params.fxRateToMad,
        costInMad: costInMad.toDecimalPlaces(2).toNumber(),
        marginSource: params.margin.source,
        marginPct,
        rawPriceMad: rawPrice.toDecimalPlaces(2).toNumber(),
        roundingIncrement: params.roundingIncrement,
        roundingMode: params.roundingMode,
        suggestedPriceMad: suggested,
      },
      params.publishedPriceMad,
    ),
  };
}

function withDelta(
  partial: Omit<SuggestedPriceBreakdown, "publishedPriceMad" | "differenceMad" | "differencePct">,
  publishedPriceMad: number | null,
): SuggestedPriceBreakdown {
  const differenceMad =
    publishedPriceMad != null ? partial.suggestedPriceMad - publishedPriceMad : null;
  const differencePct =
    publishedPriceMad != null && publishedPriceMad !== 0
      ? Number(((differenceMad! / publishedPriceMad) * 100).toFixed(2))
      : null;
  return { ...partial, publishedPriceMad, differenceMad, differencePct };
}
