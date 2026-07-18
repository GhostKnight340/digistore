import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeProductCoverage,
  summarizeCoverage,
  coverageSummaryLabel,
  type CoverageLinkInput,
  type CoverageProductInput,
  type CoverageSettings,
} from "../../src/lib/guides/coverage";

const INVENTORY_ON: CoverageSettings = { inventoryEnabled: true, stockTracked: true };
const INVENTORY_MANUAL: CoverageSettings = { inventoryEnabled: true, stockTracked: false };
const INVENTORY_OFF: CoverageSettings = { inventoryEnabled: false, stockTracked: false };

function variant(over: Partial<CoverageProductInput["variants"][number]> = {}) {
  return {
    id: "v1",
    name: "EUR 20",
    active: true,
    stockMode: "automatic",
    region: null,
    manualFulfillmentAllowed: true,
    enabledSupplierMappings: 0,
    unusedCodes: 5,
    ...over,
  };
}

function product(over: Partial<CoverageProductInput> = {}): CoverageProductInput {
  return {
    id: "p1",
    name: "Steam Wallet",
    slug: "steam-wallet",
    active: true,
    region: "FR",
    categoryActive: true,
    variants: [variant()],
    ...over,
  };
}

function link(over: Partial<CoverageLinkInput> = {}): CoverageLinkInput {
  return { productId: "p1", variantId: null, product: product(), ...over };
}

test("a live product with an in-stock active variant is available", () => {
  const r = computeProductCoverage(link(), INVENTORY_ON);
  assert.equal(r.status, "available");
  assert.equal(r.reason, null);
  assert.equal(r.stockStatus, "in_stock");
});

test("a missing product reports product_missing, not a stock problem", () => {
  const r = computeProductCoverage(link({ product: null }), INVENTORY_ON);
  assert.equal(r.status, "unavailable");
  assert.equal(r.reason, "product_missing");
  assert.equal(r.reasonLabel, "Produit absent du catalogue");
  assert.equal(r.adminHref, null);
});

test("an inactive product reports product_inactive before any variant check", () => {
  const r = computeProductCoverage(link({ product: product({ active: false }) }), INVENTORY_ON);
  assert.equal(r.reason, "product_inactive");
});

test("a disabled category hides the product", () => {
  const r = computeProductCoverage(
    link({ product: product({ categoryActive: false }) }),
    INVENTORY_ON,
  );
  assert.equal(r.reason, "category_inactive");
});

test("no active variant reports no_active_variant", () => {
  const r = computeProductCoverage(
    link({ product: product({ variants: [variant({ active: false })] }) }),
    INVENTORY_ON,
  );
  assert.equal(r.reason, "no_active_variant");
});

test("force_out_of_stock is respected when inventory is enabled", () => {
  const r = computeProductCoverage(
    link({ product: product({ variants: [variant({ stockMode: "force_out_of_stock" })] }) }),
    INVENTORY_ON,
  );
  assert.equal(r.reason, "out_of_stock");
  assert.equal(r.stockStatus, "out_of_stock");
});

test("zero codes is out of stock only when stock is tracked", () => {
  const p = product({ variants: [variant({ unusedCodes: 0 })] });
  assert.equal(computeProductCoverage(link({ product: p }), INVENTORY_ON).reason, "out_of_stock");
  // inventoryMode "manual" → quantities are not tracked, so it stays available.
  const manual = computeProductCoverage(link({ product: p }), INVENTORY_MANUAL);
  assert.equal(manual.status, "available");
});

test("inventory disabled ignores stock entirely and never reports a stock status", () => {
  const p = product({
    variants: [variant({ stockMode: "force_out_of_stock", unusedCodes: 0 })],
  });
  const r = computeProductCoverage(link({ product: p }), INVENTORY_OFF);
  assert.equal(r.status, "available");
  // Null stockStatus is what suppresses all stock wording in the UI.
  assert.equal(r.stockStatus, null);
});

test("no fulfilment route (no supplier, no manual) is reported explicitly", () => {
  const p = product({
    variants: [variant({ manualFulfillmentAllowed: false, enabledSupplierMappings: 0 })],
  });
  const r = computeProductCoverage(link({ product: p }), INVENTORY_ON);
  assert.equal(r.reason, "no_supplier_route");
});

test("a pinned variant that no longer exists is unavailable", () => {
  const r = computeProductCoverage(link({ variantId: "gone" }), INVENTORY_ON);
  assert.equal(r.reason, "no_active_variant");
});

test("a pinned variant is judged on its own state, not its siblings", () => {
  const p = product({
    variants: [variant({ id: "v1", active: false }), variant({ id: "v2", active: true })],
  });
  assert.equal(computeProductCoverage(link({ variantId: "v1", product: p }), INVENTORY_ON).reason, "no_active_variant");
  assert.equal(computeProductCoverage(link({ variantId: "v2", product: p }), INVENTORY_ON).status, "available");
});

test("summarize splits green/red and keeps expected labels as documentation", () => {
  const ok = computeProductCoverage(link(), INVENTORY_ON);
  const bad = computeProductCoverage(link({ product: null }), INVENTORY_ON);
  const s = summarizeCoverage([ok, bad], ["Steam Wallet USA", "Steam Wallet UK"]);
  assert.equal(s.counts.available, 1);
  assert.equal(s.counts.unavailable, 1);
  assert.equal(s.counts.expected, 2);
  assert.equal(s.hasSellableProduct, true);
  assert.ok(s.expected.every((e) => e.missing === true));
});

test("an expected label matching an available product is dropped as contradictory", () => {
  const ok = computeProductCoverage(link(), INVENTORY_ON);
  // Same product, differing case/accents — must not be listed as missing too.
  const s = summarizeCoverage([ok], ["steam wallet", "Steam Wallet USA"]);
  assert.deepEqual(
    s.expected.map((e) => e.label),
    ["Steam Wallet USA"],
  );
});

test("expected labels are de-duplicated case-insensitively", () => {
  const s = summarizeCoverage([], ["Steam USA", "steam usa", " "]);
  assert.equal(s.counts.expected, 1);
});

test("hasSellableProduct is false when every link is unavailable", () => {
  const bad = computeProductCoverage(link({ product: product({ active: false }) }), INVENTORY_ON);
  assert.equal(summarizeCoverage([bad], []).hasSellableProduct, false);
});

test("summary label reads naturally and omits empty groups", () => {
  const ok = computeProductCoverage(link(), INVENTORY_ON);
  assert.equal(coverageSummaryLabel(summarizeCoverage([ok], [])), "1 disponible");
  const bad = computeProductCoverage(link({ product: null }), INVENTORY_ON);
  assert.equal(
    coverageSummaryLabel(summarizeCoverage([ok, bad], ["X"])),
    "1 disponible · 1 indisponible · 1 attendu",
  );
});
