// Suggested-price engine tests: margin ladder, FX conversion, rounding, fixed
// override, missing-FX handling. Pure — no DB, no network, no secrets.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveMargin,
  applyRounding,
  computeSuggestedPrice,
} from "../../src/lib/pricing/suggested-price";
import { Prisma } from "@prisma/client";
import type { MarginPolicyInputs } from "../../src/lib/pricing/types";

const ladder: MarginPolicyInputs = {
  variantFixedPriceMad: 999,
  variantMarginPct: 10,
  productMarginPct: 20,
  categoryMarginPct: 30,
  defaultMarginPct: 15,
};

test("margin resolution: variant fixed price wins over everything", () => {
  assert.deepEqual(resolveMargin(ladder), { source: "variant_fixed_price", fixedPriceMad: 999 });
});

test("margin resolution: variant margin beats product/category/global", () => {
  assert.deepEqual(resolveMargin({ ...ladder, variantFixedPriceMad: null }), {
    source: "variant",
    marginPct: 10,
  });
});

test("margin resolution: product beats category/global", () => {
  assert.deepEqual(
    resolveMargin({ ...ladder, variantFixedPriceMad: null, variantMarginPct: null }),
    { source: "product", marginPct: 20 },
  );
});

test("margin resolution: category beats global", () => {
  assert.deepEqual(
    resolveMargin({
      ...ladder,
      variantFixedPriceMad: null,
      variantMarginPct: null,
      productMarginPct: null,
    }),
    { source: "category", marginPct: 30 },
  );
});

test("margin resolution: falls through to global default", () => {
  assert.deepEqual(
    resolveMargin({
      variantFixedPriceMad: null,
      variantMarginPct: null,
      productMarginPct: null,
      categoryMarginPct: null,
      defaultMarginPct: 15,
    }),
    { source: "global_default", marginPct: 15 },
  );
});

test("margin resolution: a 0% override is a real value, not 'unset'", () => {
  assert.deepEqual(
    resolveMargin({
      variantFixedPriceMad: null,
      variantMarginPct: 0,
      productMarginPct: 20,
      categoryMarginPct: 30,
      defaultMarginPct: 15,
    }),
    { source: "variant", marginPct: 0 },
  );
});

test("rounding: nearest 5", () => {
  assert.equal(applyRounding(new Prisma.Decimal(552.23), 5, "nearest"), 550);
  assert.equal(applyRounding(new Prisma.Decimal(553), 5, "nearest"), 555);
});

test("rounding: always up to 5", () => {
  assert.equal(applyRounding(new Prisma.Decimal(552.23), 5, "up"), 555);
  assert.equal(applyRounding(new Prisma.Decimal(550), 5, "up"), 550);
});

test("rounding: nearest / up to 1 and 10", () => {
  assert.equal(applyRounding(new Prisma.Decimal(552.4), 1, "nearest"), 552);
  assert.equal(applyRounding(new Prisma.Decimal(552.4), 1, "up"), 553);
  assert.equal(applyRounding(new Prisma.Decimal(551), 10, "nearest"), 550);
  assert.equal(applyRounding(new Prisma.Decimal(551), 10, "up"), 560);
});

test("documented example: PlayStation ES 46.91 EUR → 555 MAD (up/5, 8%)", () => {
  const outcome = computeSuggestedPrice({
    providerCost: 46.91,
    supplierCurrency: "EUR",
    fxRateToMad: 10.9,
    margin: { source: "product", marginPct: 8 },
    roundingIncrement: 5,
    roundingMode: "up",
    publishedPriceMad: 579,
  });
  assert.ok(outcome.ok);
  const b = outcome.breakdown;
  assert.equal(b.costInMad, 511.32); // 46.91 × 10.9 = 511.319 → 2dp (display)
  // rawPrice uses full-precision cost (511.319 × 1.08 = 552.2245), not the
  // display-rounded 511.32 — avoids double-rounding. Final still rounds up to 555.
  assert.equal(b.rawPriceMad, 552.22);
  assert.equal(b.suggestedPriceMad, 555);
  assert.equal(b.publishedPriceMad, 579);
  assert.equal(b.differenceMad, -24);
});

test("FX conversion uses the supplier-currency rate", () => {
  const outcome = computeSuggestedPrice({
    providerCost: 10,
    supplierCurrency: "USD",
    fxRateToMad: 10.2,
    margin: { source: "global_default", marginPct: 0 },
    roundingIncrement: 1,
    roundingMode: "nearest",
    publishedPriceMad: null,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.breakdown.costInMad, 102);
  assert.equal(outcome.breakdown.suggestedPriceMad, 102);
});

test("fixed-price override short-circuits cost/FX/margin/rounding", () => {
  const outcome = computeSuggestedPrice({
    providerCost: 46.91,
    supplierCurrency: "EUR",
    fxRateToMad: 10.9,
    margin: { source: "variant_fixed_price", fixedPriceMad: 600 },
    roundingIncrement: 5,
    roundingMode: "up",
    publishedPriceMad: 579,
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.breakdown.suggestedPriceMad, 600);
  assert.equal(outcome.breakdown.marginSource, "variant_fixed_price");
  assert.equal(outcome.breakdown.differenceMad, 21);
});

test("missing FX rate for supplier currency → typed failure, no invented price", () => {
  const outcome = computeSuggestedPrice({
    providerCost: 10,
    supplierCurrency: "GBP",
    fxRateToMad: null,
    margin: { source: "global_default", marginPct: 15 },
    roundingIncrement: 5,
    roundingMode: "up",
    publishedPriceMad: 200,
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.reason, "missing_fx_rate");
});

test("suggestion is non-mutating and passes published price through untouched", () => {
  // Proxy for the invariant that computing a suggestion never writes/derives a
  // new published price. The engine only reads publishedPriceMad for the delta.
  const params = {
    providerCost: 20,
    supplierCurrency: "EUR",
    fxRateToMad: 10.9,
    margin: { source: "global_default" as const, marginPct: 15 },
    roundingIncrement: 5 as const,
    roundingMode: "up" as const,
    publishedPriceMad: 250,
  };
  const snapshot = JSON.stringify(params);
  const outcome = computeSuggestedPrice(params);
  assert.equal(JSON.stringify(params), snapshot); // inputs untouched
  assert.ok(outcome.ok);
  assert.equal(outcome.breakdown.publishedPriceMad, 250); // published unchanged
  assert.notEqual(outcome.breakdown.suggestedPriceMad, undefined);
});
