/**
 * Ledger invariants that do not need a database.
 *
 * The idempotency-key assertions are the load-bearing ones: if a key is not
 * perfectly reproducible from the slot's identifiers, a retry after a timeout
 * mints a NEW key, the supplier treats it as a fresh purchase, and the customer
 * is charged twice. Everything else in the fulfillment design assumes this
 * function is deterministic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECONCILE_ATTEMPTS,
  buildIdempotencyKey,
  isTerminal,
  needsReconciliation,
  reconcileBackoffSec,
  FULFILLMENT_STATUS,
} from "../../src/lib/suppliers/ledger";

const SLOT = { orderId: "ord_1", orderItemId: "item_1", slotIndex: 0 };

test("the idempotency key is deterministic for a slot", () => {
  // Same slot ⇒ byte-identical key, on every call, in every process.
  assert.equal(buildIdempotencyKey(SLOT), buildIdempotencyKey(SLOT));
});

test("the idempotency key derives only from stored identifiers", () => {
  // No clock, no randomness — the key must be reconstructible from the DB
  // alone after a restart, otherwise reconciliation cannot find the order.
  assert.equal(buildIdempotencyKey(SLOT), "ghost-ord_1-item_1-0");
});

test("distinct slots get distinct keys", () => {
  const keys = new Set([
    buildIdempotencyKey(SLOT),
    buildIdempotencyKey({ ...SLOT, slotIndex: 1 }),
    buildIdempotencyKey({ ...SLOT, orderItemId: "item_2" }),
    buildIdempotencyKey({ ...SLOT, orderId: "ord_2" }),
  ]);
  assert.equal(keys.size, 4, "each fulfillment slot must have its own key");
});

test("keys stay well under the documented 255-character limit", () => {
  const long = buildIdempotencyKey({
    orderId: "c".repeat(40),
    orderItemId: "d".repeat(40),
    slotIndex: 99,
  });
  assert.ok(long.length < 255, `key length ${long.length} exceeds the API limit`);
});

test("only genuinely finished states count as terminal", () => {
  assert.equal(isTerminal(FULFILLMENT_STATUS.DELIVERED), true);
  assert.equal(isTerminal(FULFILLMENT_STATUS.FAILED_CLEAN), true);
  assert.equal(isTerminal(FULFILLMENT_STATUS.ABANDONED), true);

  // Uncertain is NOT terminal — leaving it terminal would strand a possibly
  // paid order with nobody looking at it.
  assert.equal(isTerminal(FULFILLMENT_STATUS.UNCERTAIN), false);
  assert.equal(isTerminal(FULFILLMENT_STATUS.PROCESSING), false);
});

test("submitted slots require reconciliation", () => {
  // A row stuck in `submitted` means the process died between dispatch and
  // response — the highest-risk state there is.
  assert.equal(needsReconciliation(FULFILLMENT_STATUS.SUBMITTED), true);
  assert.equal(needsReconciliation(FULFILLMENT_STATUS.UNCERTAIN), true);
  assert.equal(needsReconciliation(FULFILLMENT_STATUS.PROCESSING), true);
  assert.equal(needsReconciliation(FULFILLMENT_STATUS.DELIVERED), false);
  assert.equal(needsReconciliation(FULFILLMENT_STATUS.FAILED_CLEAN), false);
});

test("reconciliation backoff grows and is capped", () => {
  assert.ok(reconcileBackoffSec(1) < reconcileBackoffSec(3));
  assert.ok(reconcileBackoffSec(3) < reconcileBackoffSec(5));
  // Capped at 30 min so a stuck order cannot burn the 120/min status quota.
  assert.equal(reconcileBackoffSec(50), 30 * 60);
});

test("reconciliation is bounded so stuck slots escalate to a human", () => {
  assert.ok(MAX_RECONCILE_ATTEMPTS > 0 && MAX_RECONCILE_ATTEMPTS <= 50);
});
