// Provider-cost calculator tests. Pure — no DB, no network, no secrets.
// Fixtures mirror shapes observed during the live Reloadly sandbox inspection
// (see docs/pricing-architecture.md), with representative numbers.
//
// Run: npm test   (tsx --conditions=react-server --test test)
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeProviderCost } from "../../src/lib/pricing/cost";
import {
  buildReloadlyCostInputs,
  type ReloadlyGiftCardProduct,
} from "../../src/lib/reloadly/operations";

function makeProduct(overrides: Partial<ReloadlyGiftCardProduct>): ReloadlyGiftCardProduct {
  return {
    productId: 1,
    productName: "Fixture",
    global: false,
    status: "ACTIVE",
    supportsPreOrder: false,
    denominationType: "FIXED",
    senderFee: 0,
    senderFeePercentage: 0,
    discountPercentage: 0,
    fixedSenderDenominations: null,
    fixedRecipientToSenderDenominationsMap: null,
    recipientCurrencyToSenderCurrencyExchangeRate: 1,
    recipientCurrencyCode: "EUR",
    senderCurrencyCode: "EUR",
    minRecipientDenomination: null,
    maxRecipientDenomination: null,
    minSenderDenomination: null,
    maxSenderDenomination: null,
    fixedRecipientDenominations: [],
    logoUrls: [],
    country: { isoName: "FR", name: "France", flagUrl: "" },
    brand: { brandId: 1, brandName: "Fixture", logoUrl: "" },
    category: { id: 3, name: "Gaming" },
    redeemInstruction: { concise: "", verbose: "" },
    ...overrides,
  };
}

test("FIXED: percentage fee only (Steam FR 10 EUR → 10.30)", () => {
  const product = makeProduct({
    productName: "Steam FR",
    senderFeePercentage: 3,
    fixedRecipientDenominations: [10, 20],
    fixedRecipientToSenderDenominationsMap: { "10.0": 10, "20.0": 20 },
  });
  const inputs = buildReloadlyCostInputs(product, 10);
  assert.ok(inputs);
  assert.equal(inputs!.senderBase, 10);
  assert.equal(computeProviderCost(inputs!).providerCost.toNumber(), 10.3);
});

test("FIXED: flat fee + discount (PlayStation ES 50 EUR, 8% disc, 0.91 fee → 46.91)", () => {
  const product = makeProduct({
    productName: "PlayStation Spain",
    discountPercentage: 8,
    senderFee: 0.91,
    fixedRecipientDenominations: [50],
    fixedRecipientToSenderDenominationsMap: { "50.0": 50 },
  });
  const inputs = buildReloadlyCostInputs(product, 50);
  assert.ok(inputs);
  const r = computeProviderCost(inputs!);
  assert.equal(r.discount.toNumber(), 4);
  assert.equal(r.flatFee.toNumber(), 0.91);
  assert.equal(r.providerCost.toNumber(), 46.91);
});

test("FIXED: flat fee + percentage fee + discount together", () => {
  // base 50, disc 1.5% = 0.75, flat 0.91, pct 1% = 0.5 → 50 + 0.91 + 0.5 − 0.75
  const r = computeProviderCost({
    senderBase: 50,
    discountPercentage: 1.5,
    senderFee: 0.91,
    senderFeePercentage: 1,
  });
  assert.equal(r.providerCost.toNumber(), 50.66);
});

test("FIXED: non-EUR recipient currency (Steam TH 50 THB, 31.4% fee)", () => {
  const product = makeProduct({
    productName: "Steam TH",
    recipientCurrencyCode: "THB",
    senderFeePercentage: 31.4,
    recipientCurrencyToSenderCurrencyExchangeRate: 0.027296,
    fixedRecipientDenominations: [50, 100],
    fixedRecipientToSenderDenominationsMap: { "50.0": 1.36, "100.0": 2.73 },
  });
  const inputs = buildReloadlyCostInputs(product, 50);
  assert.ok(inputs);
  assert.equal(inputs!.recipientCurrency, "THB");
  assert.equal(inputs!.senderCurrency, "EUR");
  assert.equal(inputs!.senderBase, 1.36);
  // 1.36 + 1.36 * 0.314 = 1.36 + 0.42704 = 1.78704
  assert.equal(computeProviderCost(inputs!).providerCost.toNumber(), 1.78704);
});

test("RANGE: senderBase = faceValue × FX rate (Roblox HK 100 HKD)", () => {
  const product = makeProduct({
    productName: "Roblox HK",
    denominationType: "RANGE",
    recipientCurrencyCode: "HKD",
    recipientCurrencyToSenderCurrencyExchangeRate: 0.116666,
    minRecipientDenomination: 50,
    maxRecipientDenomination: 783.87,
    fixedRecipientToSenderDenominationsMap: null,
    fixedSenderDenominations: null,
  });
  const inputs = buildReloadlyCostInputs(product, 100);
  assert.ok(inputs);
  assert.equal(inputs!.denominationType, "RANGE");
  assert.equal(inputs!.senderBase, 11.6666);
  assert.equal(computeProviderCost(inputs!).providerCost.toNumber(), 11.6666);
});

test("RANGE: out-of-range face value yields no inputs", () => {
  const product = makeProduct({
    denominationType: "RANGE",
    recipientCurrencyToSenderCurrencyExchangeRate: 0.1,
    minRecipientDenomination: 50,
    maxRecipientDenomination: 100,
  });
  assert.equal(buildReloadlyCostInputs(product, 25), null);
  assert.equal(buildReloadlyCostInputs(product, 500), null);
});

test("FIXED: unoffered denomination yields no inputs", () => {
  const product = makeProduct({
    fixedRecipientDenominations: [10, 20],
    fixedRecipientToSenderDenominationsMap: { "10.0": 10, "20.0": 20 },
  });
  assert.equal(buildReloadlyCostInputs(product, 15), null);
});

test("zero fees and zero discount → cost equals base", () => {
  const r = computeProviderCost({
    senderBase: 25,
    discountPercentage: 0,
    senderFee: 0,
    senderFeePercentage: 0,
  });
  assert.equal(r.providerCost.toNumber(), 25);
});

test("no floating-point drift: 0.1-style inputs stay exact", () => {
  // A naive float sum of 0.1 + 0.2 = 0.30000000000000004; Decimal must not.
  const r = computeProviderCost({
    senderBase: 0.1,
    discountPercentage: 0,
    senderFee: 0.2,
    senderFeePercentage: 0,
  });
  assert.equal(r.providerCost.toNumber(), 0.3);
});
