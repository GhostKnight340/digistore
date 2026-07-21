// AI Operations — safe-tool input validation: whitelisting, clamping, and
// rejection of arbitrary/invalid inputs. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateToolInput } from "../../src/lib/ai-ops/tools/schemas";

test("unknown tool is rejected", () => {
  const r = validateToolInput("getEverything", {});
  assert.equal(r.ok, false);
});

// The legacy periodDays lookback still backs getTopSellingProducts (other modules).
test("periodDays is clamped into [1,365] with a sane default", () => {
  const dflt = validateToolInput("getTopSellingProducts", {});
  assert.equal(dflt.ok && (dflt.value as { periodDays: number }).periodDays, 30);
  const huge = validateToolInput("getTopSellingProducts", { periodDays: 100000 });
  assert.equal(huge.ok && (huge.value as { periodDays: number }).periodDays, 365);
  const zero = validateToolInput("getTopSellingProducts", { periodDays: 0 });
  assert.equal(zero.ok && (zero.value as { periodDays: number }).periodDays, 1);
});

test("untilDays is clamped strictly below periodDays (valid window)", () => {
  const ok1 = validateToolInput("getTopSellingProducts", { periodDays: 2, untilDays: 1 });
  assert.equal(ok1.ok && (ok1.value as { untilDays: number }).untilDays, 1);
  const clamped = validateToolInput("getTopSellingProducts", { periodDays: 5, untilDays: 9 });
  assert.equal(clamped.ok && (clamped.value as { untilDays: number }).untilDays, 4);
});

// The CEO tools take a validated date-range input.
test("range input: preset, custom shape, default-today, and rejections", () => {
  const preset = validateToolInput("getSalesSummary", { range: { preset: "yesterday" } });
  assert.deepEqual(preset.ok && preset.value, { range: { preset: "yesterday" } });
  const custom = validateToolInput("getPaymentSummary", { range: { start: "2026-07-01", end: "2026-07-15" } });
  assert.deepEqual(custom.ok && custom.value, { range: { start: "2026-07-01", end: "2026-07-15" } });
  const dflt = validateToolInput("getSalesSummary", {});
  assert.deepEqual(dflt.ok && dflt.value, { range: { preset: "today" } });
  assert.equal(validateToolInput("getSalesSummary", { range: { preset: "next_year" } }).ok, false);
  assert.equal(validateToolInput("getSalesSummary", { range: { start: "07/01", end: "nope" } }).ok, false);
});

test("getProductPerformance takes a range plus a clamped limit", () => {
  const r = validateToolInput("getProductPerformance", { range: { preset: "last_week" }, limit: 999 });
  assert.deepEqual(r.ok && r.value, { range: { preset: "last_week" }, limit: 50 });
});

test("getOperationalIssues accepts no input", () => {
  assert.equal(validateToolInput("getOperationalIssues", { foo: 1 }).ok, true);
});

test("limit is clamped and coerced from strings", () => {
  const r = validateToolInput("getPendingOrders", { limit: "5" });
  assert.equal(r.ok && (r.value as { limit: number }).limit, 5);
  const over = validateToolInput("getPendingOrders", { limit: 9999 });
  assert.equal(over.ok && (over.value as { limit: number }).limit, 100);
});

test("orderId must be a safe id — rejects injection-y strings", () => {
  assert.equal(validateToolInput("getOrderDetails", { orderId: "abc123" }).ok, true);
  assert.equal(validateToolInput("getOrderDetails", { orderId: "1 OR 1=1" }).ok, false);
  assert.equal(validateToolInput("getOrderDetails", { orderId: "" }).ok, false);
  assert.equal(validateToolInput("getOrderDetails", {}).ok, false);
});

test("a null/undefined input object never throws and uses defaults", () => {
  assert.equal(validateToolInput("getSalesSummary", null).ok, true);
  assert.equal(validateToolInput("getSalesSummary", undefined).ok, true);
  assert.equal(validateToolInput("getSalesSummary", "not-an-object").ok, true);
});

test("supplier slug is format-checked; bad slugs rejected", () => {
  assert.equal(validateToolInput("getSupplierProductCosts", { supplier: "reloadly" }).ok, true);
  assert.equal(validateToolInput("getSupplierProductCosts", { supplier: "'; DROP" }).ok, false);
  // Omitting supplier is allowed (null).
  const none = validateToolInput("getSupplierProductCosts", {});
  assert.equal(none.ok && (none.value as { supplier: string | null }).supplier, null);
});

test("support reference must look like a reference", () => {
  assert.equal(validateToolInput("getSupportConversation", { reference: "GH-S-482913" }).ok, true);
  assert.equal(validateToolInput("getSupportConversation", { reference: "x".repeat(200) }).ok, false);
});
