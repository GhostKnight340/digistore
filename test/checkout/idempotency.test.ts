/**
 * Duplicate-order protection.
 *
 * The scenario these guard against costs real money: the customer double-taps
 * "Passer au paiement", or their connection drops after the server committed the
 * order but before the response arrived, and they retry. Before this guard the
 * only protection was a disabled button, which does nothing for a retry, a
 * refresh, or a second tab — so each attempt created a real order with its own
 * payment link and the customer could pay twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IDEMPOTENCY_WINDOW_MS,
  findDuplicateOrder,
  isIdempotencyEligible,
  orderSignature,
  type CandidateOrder,
} from "../../src/lib/checkout/idempotency";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function candidate(overrides: Partial<CandidateOrder> = {}): CandidateOrder {
  return {
    id: "order_1",
    status: "pending_payment",
    totalMad: 300,
    discountMad: 0,
    ghostCreditAppliedMad: 0,
    createdAt: new Date(NOW.getTime() - 30_000),
    items: [{ productId: "p1", variantId: "v1", quantity: 2 }],
    ...overrides,
  };
}

const REQUEST = {
  signature: orderSignature([{ productId: "p1", variantId: "v1", quantity: 2 }]),
  subtotalMad: 300,
};

// ── Signature ────────────────────────────────────────────────────────────────

test("signature ignores line order", () => {
  const a = orderSignature([
    { productId: "p1", variantId: null, quantity: 1 },
    { productId: "p2", variantId: null, quantity: 3 },
  ]);
  const b = orderSignature([
    { productId: "p2", variantId: null, quantity: 3 },
    { productId: "p1", variantId: null, quantity: 1 },
  ]);
  assert.equal(a, b);
});

test("signature folds split lines of the same item", () => {
  // The client may send 2×A or A + A for the same basket; both must match.
  const split = orderSignature([
    { productId: "p1", variantId: "v1", quantity: 1 },
    { productId: "p1", variantId: "v1", quantity: 1 },
  ]);
  const merged = orderSignature([{ productId: "p1", variantId: "v1", quantity: 2 }]);
  assert.equal(split, merged);
});

test("signature distinguishes variants of the same product", () => {
  const v1 = orderSignature([{ productId: "p1", variantId: "v1", quantity: 1 }]);
  const v2 = orderSignature([{ productId: "p1", variantId: "v2", quantity: 1 }]);
  const parent = orderSignature([{ productId: "p1", variantId: null, quantity: 1 }]);
  assert.notEqual(v1, v2);
  assert.notEqual(v1, parent);
});

test("signature distinguishes quantities", () => {
  assert.notEqual(
    orderSignature([{ productId: "p1", variantId: null, quantity: 1 }]),
    orderSignature([{ productId: "p1", variantId: null, quantity: 2 }]),
  );
});

// ── Eligibility ──────────────────────────────────────────────────────────────

test("a plain basket is eligible for duplicate collapsing", () => {
  assert.equal(isIdempotencyEligible({}), true);
  assert.equal(isIdempotencyEligible({ promoCode: "", ghostCreditToApplyMad: 0 }), true);
});

test("promo or Ghost Credit opts OUT of collapsing", () => {
  // Both are resolved inside the creation transaction, so the amount finally
  // owed is not knowable beforehand. Collapsing could hand back an order whose
  // total does not match what was just requested — worse than a duplicate.
  assert.equal(isIdempotencyEligible({ promoCode: "WELCOME10" }), false);
  assert.equal(isIdempotencyEligible({ ghostCreditToApplyMad: 50 }), false);
  assert.equal(isIdempotencyEligible({ promoCode: "  X  " }), false);
});

// ── Matching ─────────────────────────────────────────────────────────────────

test("an identical unpaid order created moments ago IS the duplicate", () => {
  const match = findDuplicateOrder([candidate()], REQUEST, NOW);
  assert.equal(match?.id, "order_1");
});

test("a different basket is not a duplicate", () => {
  const other = candidate({ items: [{ productId: "p9", variantId: null, quantity: 1 }] });
  assert.equal(findDuplicateOrder([other], REQUEST, NOW), null);
});

test("a different total is not a duplicate even with identical lines", () => {
  // Prices can change between attempts; that is a genuinely different order.
  const repriced = candidate({ totalMad: 250 });
  assert.equal(findDuplicateOrder([repriced], REQUEST, NOW), null);
});

test("an order that has moved past pending_payment is never collapsed onto", () => {
  // Once proof is submitted or payment confirmed, an identical basket is a real
  // second purchase and must be allowed.
  for (const status of ["payment_submitted", "payment_confirmed", "delivered", "cancelled"]) {
    assert.equal(
      findDuplicateOrder([candidate({ status })], REQUEST, NOW),
      null,
      `status ${status} must not match`,
    );
  }
});

test("an order carrying a discount or credit is never collapsed onto", () => {
  // Such an order came from an ineligible request; its total means something
  // different from this one's even when the subtotal matches.
  assert.equal(
    findDuplicateOrder([candidate({ totalMad: 300, discountMad: 50 })], REQUEST, NOW),
    null,
  );
  assert.equal(
    findDuplicateOrder([candidate({ totalMad: 300, ghostCreditAppliedMad: 50 })], REQUEST, NOW),
    null,
  );
});

test("an order older than the window is a deliberate re-order, not a retry", () => {
  const stale = candidate({
    createdAt: new Date(NOW.getTime() - IDEMPOTENCY_WINDOW_MS - 1_000),
  });
  assert.equal(findDuplicateOrder([stale], REQUEST, NOW), null);
});

test("an order exactly at the window edge still matches", () => {
  const edge = candidate({ createdAt: new Date(NOW.getTime() - IDEMPOTENCY_WINDOW_MS) });
  assert.equal(findDuplicateOrder([edge], REQUEST, NOW)?.id, "order_1");
});

test("with several matches the OLDEST wins, deterministically", () => {
  // Pre-existing duplicates from before this guard must not make the result
  // depend on query ordering — the customer most likely holds the first link.
  const older = candidate({ id: "old", createdAt: new Date(NOW.getTime() - 120_000) });
  const newer = candidate({ id: "new", createdAt: new Date(NOW.getTime() - 10_000) });
  assert.equal(findDuplicateOrder([newer, older], REQUEST, NOW)?.id, "old");
  assert.equal(findDuplicateOrder([older, newer], REQUEST, NOW)?.id, "old");
});

test("no candidates means a new order", () => {
  assert.equal(findDuplicateOrder([], REQUEST, NOW), null);
});

test("the retry of a split-line submission still collapses", () => {
  // End-to-end of the folding rule: the stored order has one merged line, the
  // retry arrives split. Same basket, so one order.
  const stored = candidate({ items: [{ productId: "p1", variantId: "v1", quantity: 2 }] });
  const retry = {
    signature: orderSignature([
      { productId: "p1", variantId: "v1", quantity: 1 },
      { productId: "p1", variantId: "v1", quantity: 1 },
    ]),
    subtotalMad: 300,
  };
  assert.equal(findDuplicateOrder([stored], retry, NOW)?.id, "order_1");
});
