import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasSufficientStock,
  isVariantAvailable,
  normalizeStockMode,
} from "../../src/lib/search/stock";

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

/**
 * Quantity-aware availability — the oversell fix.
 *
 * The bug this closes: availability was a boolean, so a variant holding ONE
 * unused code accepted an order for 100. The order was created, the customer was
 * asked to pay, and 99 of the codes did not exist.
 */

test("stock must cover the requested quantity, not merely be non-zero", () => {
  // The exact oversell case: 1 code in stock, 100 requested.
  assert.equal(hasSufficientStock("automatic", 1, 100, AUTO), false);
  assert.equal(hasSufficientStock("automatic", 1, 1, AUTO), true);
  // Boundaries either side of "exactly enough".
  assert.equal(hasSufficientStock("automatic", 5, 5, AUTO), true);
  assert.equal(hasSufficientStock("automatic", 5, 6, AUTO), false);
});

test("hasSufficientStock at quantity 1 is exactly isVariantAvailable", () => {
  // The invariant that keeps the badge and checkout from drifting apart: the
  // quantity-aware check may only be STRICTER, never differently-shaped.
  const settings = [AUTO, { inventoryEnabled: false }, { inventoryEnabled: true, inventoryMode: "manual" }, undefined];
  const modes = ["automatic", "force_in_stock", "force_out_of_stock", "something_else"];

  for (const s of settings) {
    for (const mode of modes) {
      for (const codes of [0, 1, 99]) {
        assert.equal(
          hasSufficientStock(mode, codes, 1, s),
          isVariantAvailable(mode, codes, s),
          `diverged for mode=${mode} codes=${codes} settings=${JSON.stringify(s)}`,
        );
      }
    }
  }
});

test("the overrides keep their meaning regardless of quantity", () => {
  // force_in_stock is an explicit "sell it anyway" — quantity must not undo it.
  assert.equal(hasSufficientStock("force_in_stock", 0, 1000, AUTO), true);
  // force_out_of_stock refuses even a single unit.
  assert.equal(hasSufficientStock("force_out_of_stock", 999, 1, AUTO), false);
});

test("inventory disabled skips the quantity check entirely", () => {
  // With the inventory system off there is no count to validate against, so
  // checkout must not invent an inventory-specific refusal.
  assert.equal(hasSufficientStock("automatic", 0, 100, { inventoryEnabled: false }), true);
});

test("manual inventory mode ignores quantity as well as the count", () => {
  const manual = { inventoryEnabled: true, inventoryMode: "manual" };
  assert.equal(hasSufficientStock("automatic", 0, 50, manual), true);
});

test("a non-positive quantity is never fulfillable", () => {
  // Callers drop these earlier; the predicate must still not answer "yes".
  assert.equal(hasSufficientStock("automatic", 10, 0, AUTO), false);
  assert.equal(hasSufficientStock("automatic", 10, -5, AUTO), false);
});
