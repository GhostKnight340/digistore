// Variant supplier-mapping eligibility + margin rules. Run: npm test
//
// These exercise the pure decision layer behind "can this variant be
// fulfilled?" (src/lib/suppliers/eligibility.ts) — no DB/Next needed. The
// same function backs the admin warnings, product-list summary, and the
// delivery path, so these tests cover the spec's eligibility matrix.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeFulfillmentEligibility,
  computeMappingMargin,
  isMappingComplete,
  SUPPLY_SUMMARY_LABELS,
  type MappingEligibilityInput,
  type SupplierGlobalState,
} from "../../src/lib/suppliers/eligibility";

const SUPPLIERS_OK: SupplierGlobalState = {
  reloadly: { enabled: true, configured: true },
  fazercards: { enabled: true, configured: true },
};

function reloadlyMapping(overrides: Partial<MappingEligibilityInput> = {}): MappingEligibilityInput {
  return {
    id: "m-reloadly",
    supplier: "reloadly",
    enabled: true,
    autoFulfillEnabled: true,
    priority: 1,
    supplierProductId: "18681",
    supplierCategoryId: null,
    supplierKind: null,
    lastValidationOk: true,
    ...overrides,
  };
}

function fazercardsMapping(overrides: Partial<MappingEligibilityInput> = {}): MappingEligibilityInput {
  return {
    id: "m-fazercards",
    supplier: "fazercards",
    enabled: true,
    autoFulfillEnabled: true,
    priority: 2,
    supplierProductId: "card_10usd",
    supplierCategoryId: "gc_steam_1",
    supplierKind: "gift_card",
    lastValidationOk: true,
    ...overrides,
  };
}

test("a valid Reloadly mapping yields a preferred route", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping()],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, true);
  assert.equal(result.summary, "ready");
  assert.equal(result.supplierRoutes[0]?.role, "preferred");
  assert.ok(result.reasons.includes("preferred_supplier_available"));
});

test("a valid FazerCards mapping yields a route; completeness needs category+kind", () => {
  const result = computeFulfillmentEligibility({
    mappings: [fazercardsMapping({ priority: 1 })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, true);
  assert.equal(result.supplierRoutes[0]?.supplier, "fazercards");

  assert.equal(isMappingComplete(fazercardsMapping({ supplierCategoryId: null })), false);
  assert.equal(isMappingComplete(fazercardsMapping({ supplierKind: null })), false);
  assert.equal(isMappingComplete(reloadlyMapping({ supplierProductId: " " })), false);
});

test("preferred (priority 1) and backup (priority 2) roles are derived from priority", () => {
  const result = computeFulfillmentEligibility({
    mappings: [fazercardsMapping({ priority: 2 }), reloadlyMapping({ priority: 1 })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.deepEqual(
    result.supplierRoutes.map((route) => [route.supplier, route.role]),
    [
      ["reloadly", "preferred"],
      ["fazercards", "backup"],
    ],
  );
});

test("the same supplier cannot be preferred AND backup (unique per supplier upstream); backup route surfaces when preferred is unusable", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ enabled: false }), fazercardsMapping({ priority: 2 })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.supplierRoutes.length, 1);
  assert.equal(result.supplierRoutes[0]?.role, "backup");
  assert.ok(result.reasons.includes("backup_supplier_available"));
  assert.ok(result.reasons.includes("mapping_disabled"));
});

test("a globally disabled supplier is not eligible", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping()],
    suppliers: { reloadly: { enabled: false, configured: true } },
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.ok(result.reasons.includes("supplier_disabled"));
  assert.ok(result.reasons.includes("no_route"));
});

test("an unconfigured supplier is not eligible", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping()],
    suppliers: { reloadly: { enabled: true, configured: false } },
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.ok(result.reasons.includes("supplier_unconfigured"));
});

test("a disabled mapping is not eligible", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ enabled: false })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.ok(result.reasons.includes("mapping_disabled"));
});

test("a mapping whose validation failed is not eligible", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ lastValidationOk: false })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.ok(result.reasons.includes("mapping_invalid"));
});

test("a never-validated mapping stays eligible but is flagged", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ lastValidationOk: null })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, true);
  assert.equal(result.supplierRoutes[0]?.neverValidated, true);
});

test("auto-fulfillment disabled on the mapping removes the route", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ autoFulfillEnabled: false })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.ok(result.reasons.includes("auto_fulfillment_disabled"));
});

test("manual fulfillment provides a fallback route", () => {
  const result = computeFulfillmentEligibility({
    mappings: [reloadlyMapping({ lastValidationOk: false })],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: true,
  });
  assert.equal(result.fulfillable, true);
  assert.equal(result.summary, "incomplete");
  assert.ok(result.reasons.includes("manual_available"));
});

test("manual only: no mappings but manual allowed", () => {
  const result = computeFulfillmentEligibility({
    mappings: [],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: true,
  });
  assert.equal(result.summary, "manual_only");
  assert.ok(result.reasons.includes("mapping_missing"));
});

test("no fulfillment route is correctly detected", () => {
  const result = computeFulfillmentEligibility({
    mappings: [],
    suppliers: SUPPLIERS_OK,
    manualFulfillmentAllowed: false,
  });
  assert.equal(result.fulfillable, false);
  assert.equal(result.summary, "none");
  assert.deepEqual(SUPPLY_SUMMARY_LABELS[result.summary], "Aucun approvisionnement");
  assert.ok(result.reasons.includes("no_route"));
});

// ── Margin computation ───────────────────────────────────────────────────────

test("margin computes in MAD without conversion", () => {
  const margin = computeMappingMargin({
    sellingPriceMad: 120,
    costAmount: 95,
    costCurrency: "MAD",
    fxRatesToMad: {},
  });
  assert.ok(margin.computable);
  if (margin.computable) {
    assert.equal(margin.costMad, 95);
    assert.equal(margin.marginMad, 25);
    assert.equal(margin.marginPct, 20.8);
    assert.equal(margin.converted, false);
  }
});

test("margin converts via the internal FX table", () => {
  const margin = computeMappingMargin({
    sellingPriceMad: 120,
    costAmount: 10,
    costCurrency: "USD",
    fxRatesToMad: { USD: 10.2 },
  });
  assert.ok(margin.computable);
  if (margin.computable) {
    assert.equal(margin.costMad, 102);
    assert.equal(margin.marginMad, 18);
    assert.equal(margin.converted, true);
  }
});

test("margin is declared not-computable without a rate or cost", () => {
  assert.deepEqual(
    computeMappingMargin({ sellingPriceMad: 120, costAmount: 10, costCurrency: "USD", fxRatesToMad: {} }),
    { computable: false, reason: "missing_fx_rate" },
  );
  assert.deepEqual(
    computeMappingMargin({ sellingPriceMad: 120, costAmount: null, costCurrency: "USD", fxRatesToMad: {} }),
    { computable: false, reason: "missing_cost" },
  );
});
