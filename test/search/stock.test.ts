import assert from "node:assert/strict";
import { test } from "node:test";

import { isVariantAvailable, normalizeStockMode } from "../../src/lib/search/stock";

/**
 * The storefront availability rule and the checkout rule
 * (`isVariantPurchasable` in src/lib/db/promoResolve.ts) MUST agree. If the
 * storefront shows a variant as available and checkout refuses it, the customer
 * hits a broken purchase; the reverse silently hides sellable stock. These
 * cases pin the shared truth table so the two can't drift apart unnoticed.
 */

const AUTO = { inventoryEnabled: true, inventoryMode: "automatic" };

test("force_in_stock is always available, whatever the code count", () => {
  assert.equal(isVariantAvailable("force_in_stock", 0, AUTO), true);
  assert.equal(isVariantAvailable("force_in_stock", 0, { inventoryEnabled: false }), true);
});

test("force_out_of_stock is unavailable while inventory is on", () => {
  assert.equal(isVariantAvailable("force_out_of_stock", 999, AUTO), false);
});

test("inventory globally OFF ignores the force_out_of_stock override", () => {
  // Inventory off means availability is active-only — the override is an
  // inventory lever, so it must not keep a variant unbuyable.
  assert.equal(
    isVariantAvailable("force_out_of_stock", 0, { inventoryEnabled: false }),
    true,
  );
  assert.equal(isVariantAvailable("automatic", 0, { inventoryEnabled: false }), true);
});

test("automatic mode is driven by the unused-code count", () => {
  assert.equal(isVariantAvailable("automatic", 0, AUTO), false);
  assert.equal(isVariantAvailable("automatic", 1, AUTO), true);
});

test("manual inventory mode ignores the code count", () => {
  // Codes are fulfilled by hand, so a zero count says nothing about stock.
  const manual = { inventoryEnabled: true, inventoryMode: "manual" };
  assert.equal(isVariantAvailable("automatic", 0, manual), true);
});

test("no inventory context is treated as available", () => {
  // Some catalogue DTOs carry no settings; they must not read as sold out.
  assert.equal(isVariantAvailable("automatic", 0, undefined), true);
});

test("unknown stock modes normalize to automatic", () => {
  assert.equal(normalizeStockMode("something_else"), "automatic");
  assert.equal(normalizeStockMode("force_in_stock"), "force_in_stock");
  assert.equal(normalizeStockMode("force_out_of_stock"), "force_out_of_stock");
  // …and therefore behave quantity-driven, not permanently available.
  assert.equal(isVariantAvailable("something_else", 0, AUTO), false);
});
