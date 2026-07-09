/**
 * THE provider-cost formula — the single source of truth. Sync, admin, and
 * fulfillment reconciliation all call this; it is never re-derived elsewhere.
 *
 * Pure and dependency-light: uses Prisma.Decimal (bundled with @prisma/client,
 * decimal.js under the hood) for exact money math — never JS floating point —
 * and does NOT import `server-only`, so the Node test runner can exercise it.
 *
 * Formula (all figures in SENDER / wallet currency, e.g. EUR):
 *
 *   discount      = senderBase × discountPercentage / 100
 *   percentageFee = senderBase × senderFeePercentage / 100
 *   providerCost  = senderBase + senderFee + percentageFee − discount
 *
 * `senderBase` is resolved upstream (buildReloadlyCostInputs): the exact map
 * figure for FIXED, or faceValue × FX rate for RANGE.
 */
import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Decimal places kept for provider cost — matches DB Decimal(18,6). */
export const PROVIDER_COST_DP = 6;

/** Structural inputs the formula needs. A superset (e.g. ReloadlyCostInputs) is assignable. */
export type ProviderCostFormulaInputs = {
  senderBase: number | string | Decimal;
  discountPercentage: number | string | Decimal;
  senderFee: number | string | Decimal;
  senderFeePercentage: number | string | Decimal;
};

export type ProviderCostResult = {
  senderBase: Decimal;
  discount: Decimal;
  percentageFee: Decimal;
  flatFee: Decimal;
  /** senderBase + flatFee + percentageFee − discount, rounded to PROVIDER_COST_DP. */
  providerCost: Decimal;
};

function d(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/**
 * Computes the provider cost from resolved inputs. Returns Decimals so callers
 * decide how to persist/round further; `providerCost` is already quantized to
 * PROVIDER_COST_DP so what is stored equals what was computed.
 */
export function computeProviderCost(inputs: ProviderCostFormulaInputs): ProviderCostResult {
  const senderBase = d(inputs.senderBase);
  const discountPct = d(inputs.discountPercentage);
  const feePct = d(inputs.senderFeePercentage);
  const flatFee = d(inputs.senderFee);

  const hundred = new Decimal(100);
  const discount = senderBase.mul(discountPct).div(hundred);
  const percentageFee = senderBase.mul(feePct).div(hundred);

  const providerCost = senderBase
    .plus(flatFee)
    .plus(percentageFee)
    .minus(discount)
    .toDecimalPlaces(PROVIDER_COST_DP);

  return { senderBase, discount, percentageFee, flatFee, providerCost };
}

/** Convenience: just the final provider cost as a Decimal. */
export function providerCostOf(inputs: ProviderCostFormulaInputs): Decimal {
  return computeProviderCost(inputs).providerCost;
}
