// AI Support Coverage — notify gating + auto-pause. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldNotify } from "../../src/lib/ai-ops/support/notify";
import { evaluateAutoPause, AUTOPAUSE_FAILURES_PER_SWEEP, AUTOPAUSE_CONSECUTIVE_LOW } from "../../src/lib/ai-ops/support/safety";

test("notify: urgent + ended always notify, in every mode", () => {
  for (const mode of ["urgent_only", "approvals_and_urgent", "periodic_and_urgent", "all_escalations", "silent_until_end"] as const) {
    assert.equal(shouldNotify(mode, "urgent"), true, `${mode}/urgent`);
    assert.equal(shouldNotify(mode, "ended"), true, `${mode}/ended`);
  }
});

test("notify: silent_until_end suppresses approvals but not urgent", () => {
  assert.equal(shouldNotify("silent_until_end", "approval"), false);
  assert.equal(shouldNotify("silent_until_end", "urgent"), true);
});

test("notify: urgent_only suppresses approvals", () => {
  assert.equal(shouldNotify("urgent_only", "approval"), false);
});

test("notify: approvals_and_urgent surfaces approvals", () => {
  assert.equal(shouldNotify("approvals_and_urgent", "approval"), true);
  assert.equal(shouldNotify("approvals_and_urgent", "periodic"), false);
});

test("notify: periodic mode surfaces periodic, not per-approval", () => {
  assert.equal(shouldNotify("periodic_and_urgent", "periodic"), true);
  assert.equal(shouldNotify("periodic_and_urgent", "approval"), false);
});

test("autopause: fires on a burst of failures", () => {
  const d = evaluateAutoPause({ failedThisSweep: AUTOPAUSE_FAILURES_PER_SWEEP, consecutiveLowConfidence: 0 });
  assert.equal(d.pause, true);
  assert.match(d.reason!, /échecs/);
});

test("autopause: fires on consecutive low confidence", () => {
  const d = evaluateAutoPause({ failedThisSweep: 0, consecutiveLowConfidence: AUTOPAUSE_CONSECUTIVE_LOW });
  assert.equal(d.pause, true);
  assert.match(d.reason!, /confiance/);
});

test("autopause: does not fire below thresholds", () => {
  assert.equal(evaluateAutoPause({ failedThisSweep: 1, consecutiveLowConfidence: 1 }).pause, false);
});
