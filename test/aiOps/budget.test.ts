// AI Operations — budget guardrails (spec §12). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateBudget } from "../../src/lib/ai-ops/budget";

const noLimits = { monthlyBudgetUsd: 0, warningThresholdUsd: 0, hardLimitUsd: 0 };
const noState = {
  monthSpentUsd: 0,
  moduleDaySpentUsd: 0,
  moduleDailyCapUsd: 0,
  moduleExecutionsToday: 0,
  moduleMaxExecutionsPerDay: 0,
};

test("with no limits set, everything is allowed (limits of 0 = unset)", () => {
  const d = evaluateBudget(noLimits, noState, 5);
  assert.equal(d.allowed, true);
  assert.equal(d.warning, false);
});

test("monthly hard limit blocks a run that would exceed it", () => {
  const d = evaluateBudget(
    { monthlyBudgetUsd: 100, warningThresholdUsd: 80, hardLimitUsd: 100 },
    { ...noState, monthSpentUsd: 99.5 },
    1,
  );
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "monthly_hard_limit");
});

test("monthly budget blocks when projected spend exceeds it", () => {
  const d = evaluateBudget(
    { monthlyBudgetUsd: 50, warningThresholdUsd: 0, hardLimitUsd: 0 },
    { ...noState, monthSpentUsd: 50 },
    0.01,
  );
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "monthly_budget");
});

test("module daily cost cap blocks the module even under the global budget", () => {
  const d = evaluateBudget(
    { monthlyBudgetUsd: 1000, warningThresholdUsd: 0, hardLimitUsd: 0 },
    { ...noState, moduleDaySpentUsd: 1, moduleDailyCapUsd: 1 },
    0.5,
  );
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "module_daily_cost");
});

test("module daily execution count cap blocks further runs", () => {
  const d = evaluateBudget(noLimits, { ...noState, moduleExecutionsToday: 24, moduleMaxExecutionsPerDay: 24 });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "module_daily_executions");
});

test("warning threshold flags but does not block", () => {
  const d = evaluateBudget(
    { monthlyBudgetUsd: 100, warningThresholdUsd: 80, hardLimitUsd: 100 },
    { ...noState, monthSpentUsd: 85 },
    1,
  );
  assert.equal(d.allowed, true);
  assert.equal(d.warning, true);
});

test("priority: hard limit is checked before the module caps", () => {
  const d = evaluateBudget(
    { monthlyBudgetUsd: 100, warningThresholdUsd: 0, hardLimitUsd: 100 },
    { ...noState, monthSpentUsd: 100, moduleExecutionsToday: 999, moduleMaxExecutionsPerDay: 1 },
    1,
  );
  assert.equal(d.reason, "monthly_hard_limit");
});
