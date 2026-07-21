// AI Operations — per-module + per-tool rate limiting. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  consumeToolBudget,
  AI_TOOL_POLICIES,
  __resetToolRateLimit,
} from "../../src/lib/ai-ops/rateLimit";

test("allows up to the per-(module,tool) budget then denies", () => {
  __resetToolRateLimit();
  const t0 = 1_000_000;
  const cap = AI_TOOL_POLICIES.perModuleTool.limit;
  for (let i = 0; i < cap; i++) {
    assert.equal(consumeToolBudget("discord_assistant", "getSalesSummary", t0).allowed, true, `call ${i}`);
  }
  assert.equal(consumeToolBudget("discord_assistant", "getSalesSummary", t0).allowed, false);
});

test("different tools have independent per-tool budgets", () => {
  __resetToolRateLimit();
  const t0 = 2_000_000;
  const cap = AI_TOOL_POLICIES.perModuleTool.limit;
  for (let i = 0; i < cap; i++) consumeToolBudget("support_assistant", "getOrderDetails", t0);
  // The exhausted tool is blocked...
  assert.equal(consumeToolBudget("support_assistant", "getOrderDetails", t0).allowed, false);
  // ...but a different tool for the same module still has budget.
  assert.equal(consumeToolBudget("support_assistant", "getCustomerHistory", t0).allowed, true);
});

test("the per-module ceiling caps total calls across tools", () => {
  __resetToolRateLimit();
  const t0 = 3_000_000;
  const moduleCap = AI_TOOL_POLICIES.perModule.limit;
  let allowed = 0;
  // Spread across many distinct tools so the per-tool cap never bites first.
  const tools = ["getSalesSummary", "getPendingOrders", "getPaymentSummary", "getProductPerformance", "getTopSellingProducts", "getRecentOperationalEvents"];
  for (let i = 0; i < moduleCap + 5; i++) {
    if (consumeToolBudget("business_intelligence", tools[i % tools.length], t0).allowed) allowed++;
  }
  assert.equal(allowed, moduleCap);
});

test("budget frees up after the window passes", () => {
  __resetToolRateLimit();
  const t0 = 4_000_000;
  const cap = AI_TOOL_POLICIES.perModuleTool.limit;
  for (let i = 0; i < cap; i++) consumeToolBudget("marketing_assistant", "getSalesSummary", t0);
  assert.equal(consumeToolBudget("marketing_assistant", "getSalesSummary", t0).allowed, false);
  const later = t0 + AI_TOOL_POLICIES.perModuleTool.windowMs + 1;
  assert.equal(consumeToolBudget("marketing_assistant", "getSalesSummary", later).allowed, true);
});
