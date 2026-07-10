// Cross-currency mapping validation tests. Pure — no DB, no network.
// The rule under test: the Reloadly (recipient) currency is the SOURCE COST
// currency; MAD is the storefront currency. A MAD variant mapped to a USD
// product is valid when a USD→MAD rate exists, an error only when it doesn't.
// Denomination/country checks stay strict — fulfillment sends faceValue as the
// Reloadly unitPrice, so those protect real wallet spend.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateReloadlyDenomination,
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
    recipientCurrencyCode: "USD",
    senderCurrencyCode: "USD",
    minRecipientDenomination: null,
    maxRecipientDenomination: null,
    minSenderDenomination: null,
    maxSenderDenomination: null,
    fixedRecipientDenominations: [1, 2, 5, 10],
    logoUrls: [],
    country: { isoName: "US", name: "United States", flagUrl: "" },
    brand: { brandId: 1, brandName: "Fixture", logoUrl: "" },
    category: { id: 3, name: "Gaming" },
    redeemInstruction: { concise: "", verbose: "" },
    ...overrides,
  } as ReloadlyGiftCardProduct;
}

const FX = { USD: 10.2, EUR: 11.1 };

test("MAD variant on a USD product is VALID when a USD→MAD rate exists", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 2, currency: "MAD", countryCode: "US" },
    FX,
  );
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
  assert.ok(r.infos.some((i) => i.includes("converti de USD vers MAD")));
});

test("MAD variant on a USD product FAILS when no USD→MAD rate is configured", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 2, currency: "MAD", countryCode: "US" },
    { EUR: 11.1 }, // no USD rate
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("Aucun taux de change USD → MAD")));
});

test("an explicit non-storefront currency mismatch is still a genuine error", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 2, currency: "EUR", countryCode: "US" },
    FX,
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("Devise attendue EUR")));
});

test("matching provider currency has no issue and no conversion note", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 2, currency: "USD", countryCode: "US" },
    FX,
  );
  assert.equal(r.ok, true);
  assert.equal(r.infos.length, 0);
});

test("denomination check stays strict even for a valid cross-currency mapping", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 3, currency: "MAD", countryCode: "US" }, // 3 not in [1,2,5,10]
    FX,
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("non proposé par Reloadly")));
});

test("country check stays strict even for a valid cross-currency mapping", () => {
  const r = validateReloadlyDenomination(
    makeProduct({}),
    { faceValue: 2, currency: "MAD", countryCode: "MA" },
    FX,
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("Pays attendu MA")));
});

test("without an FX table (caller can't check) cross-currency is informational", () => {
  const r = validateReloadlyDenomination(makeProduct({}), {
    faceValue: 2,
    currency: "MAD",
    countryCode: "US",
  });
  assert.equal(r.ok, true);
  assert.ok(r.infos.some((i) => i.includes("taux interne")));
});

test("RANGE products validate range bounds, not fixed denominations", () => {
  const r = validateReloadlyDenomination(
    makeProduct({
      denominationType: "RANGE",
      fixedRecipientDenominations: [],
      minRecipientDenomination: 5,
      maxRecipientDenomination: 100,
    }),
    { faceValue: 3, currency: "MAD", countryCode: "US" },
    FX,
  );
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("hors de la plage")));
});
