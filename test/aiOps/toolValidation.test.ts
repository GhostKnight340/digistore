// AI Operations — safe-tool input validation: whitelisting, clamping, and
// rejection of arbitrary/invalid inputs. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateToolInput } from "../../src/lib/ai-ops/tools/schemas";

test("unknown tool is rejected", () => {
  const r = validateToolInput("getEverything", {});
  assert.equal(r.ok, false);
});

test("period is clamped into [1,365] with a sane default", () => {
  const dflt = validateToolInput("getSalesSummary", {});
  assert.equal(dflt.ok && (dflt.value as { periodDays: number }).periodDays, 7);
  const huge = validateToolInput("getSalesSummary", { periodDays: 100000 });
  assert.equal(huge.ok && (huge.value as { periodDays: number }).periodDays, 365);
  const zero = validateToolInput("getSalesSummary", { periodDays: 0 });
  assert.equal(zero.ok && (zero.value as { periodDays: number }).periodDays, 1);
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
