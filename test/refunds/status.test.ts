import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canTransition,
  formatRefundNumber,
  isRefundActive,
  settledStatusForResolution,
  statusesForQueueTab,
} from "../../src/lib/refunds/status";

test("refund numbers use the stable RF-000000 format", () => {
  assert.equal(formatRefundNumber(12), "RF-000012");
});

test("the state machine permits the intended customer workflow", () => {
  assert.ok(canTransition("REQUESTED", "UNDER_REVIEW"));
  assert.ok(canTransition("UNDER_REVIEW", "INFORMATION_REQUIRED"));
  assert.ok(canTransition("INFORMATION_REQUIRED", "CUSTOMER_RESPONDED"));
  assert.ok(canTransition("CUSTOMER_RESPONDED", "APPROVED_AWAITING_CHOICE"));
  assert.ok(canTransition("APPROVED_AWAITING_CHOICE", "CHOICE_RECEIVED"));
});

test("terminal cases cannot be processed again without an explicit reopen", () => {
  for (const status of ["REFUNDED", "CREDITED", "REPLACED"] as const) {
    assert.equal(isRefundActive(status), false);
    assert.equal(canTransition(status, "CHOICE_RECEIVED"), false);
  }
  assert.ok(canTransition("NOT_ELIGIBLE", "UNDER_REVIEW"));
  assert.ok(canTransition("CANCELLED", "UNDER_REVIEW"));
});

test("each resolution settles into its matching terminal state", () => {
  assert.equal(settledStatusForResolution("ORIGINAL_PAYMENT_METHOD"), "REFUNDED");
  assert.equal(settledStatusForResolution("GHOST_CREDIT"), "CREDITED");
  assert.equal(settledStatusForResolution("REPLACEMENT_PRODUCT"), "REPLACED");
});

test("processing queue includes choices, refunds in progress, and replacements", () => {
  assert.deepEqual(statusesForQueueTab("to_process"), [
    "CHOICE_RECEIVED",
    "REFUND_PROCESSING",
    "REPLACEMENT_PENDING",
  ]);
});
