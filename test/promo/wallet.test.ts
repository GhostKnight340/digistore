// Ghost Credit wallet accounting — pure unit tests. No DB, no network.
// These cover the money/ledger rules and the exact idempotency keys the DB
// layer uses (the live code imports these same functions), plus the reversal
// math. DB-level concurrency guarantees (row-lock serialization) are documented
// in docs/wallet-audit.md and cannot be exercised without a Postgres test DB.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveBalance,
  capDebit,
  capSpend,
  promoCreditKey,
  promoReversalKey,
  orderSpendKey,
  orderRefundKey,
  manualCreditKey,
  walletExpireKey,
  type LedgerRow,
} from "../../src/lib/promo/ledgerMath";
import { computeCreditReversal, computeGhostCredit } from "../../src/lib/promo/engine";

// ── balance derivation (reconciliation source of truth) ──────────────────────
test("deriveBalance sums active credits minus active debits; ignores reversed/expired", () => {
  const rows: LedgerRow[] = [
    { direction: "credit", amountMad: 100, status: "active" },
    { direction: "debit", amountMad: 30, status: "active" },
    { direction: "credit", amountMad: 50, status: "reversed" }, // excluded
    { direction: "debit", amountMad: 50, status: "active" }, // the reversal debit stays? no — excluded pair
    { direction: "credit", amountMad: 20, status: "expired" }, // excluded
  ];
  // active: +100 -30 -50 = 20
  assert.equal(deriveBalance(rows), 20);
});

test("deriveBalance of an empty ledger is 0", () => {
  assert.equal(deriveBalance([]), 0);
});

// ── debit capping (no negative balance / overspend) ──────────────────────────
test("capDebit never exceeds balance unless allowNegative", () => {
  assert.deepEqual(capDebit(100, 40, false), { appliedMad: 40, wouldGoNegative: true });
  assert.deepEqual(capDebit(30, 40, false), { appliedMad: 30, wouldGoNegative: false });
  assert.deepEqual(capDebit(100, 40, true), { appliedMad: 100, wouldGoNegative: true });
});

test("capDebit rejects zero/negative requests", () => {
  assert.deepEqual(capDebit(0, 40, false), { appliedMad: 0, wouldGoNegative: false });
  assert.deepEqual(capDebit(-5, 40, false), { appliedMad: 0, wouldGoNegative: false });
});

test("capDebit against an empty wallet applies nothing", () => {
  assert.deepEqual(capDebit(50, 0, false), { appliedMad: 0, wouldGoNegative: true });
});

// ── spend capping at checkout (server authority) ─────────────────────────────
test("capSpend caps to balance, remaining payable, and floors to integer", () => {
  assert.equal(capSpend(1000, 50, 120), 50); // capped by balance
  assert.equal(capSpend(1000, 200, 120), 120); // capped by payable
  assert.equal(capSpend(30.9, 200, 120), 30); // floored
});

test("capSpend rejects negative / non-finite / zero client amounts", () => {
  assert.equal(capSpend(-100, 200, 120), 0);
  assert.equal(capSpend(0, 200, 120), 0);
  assert.equal(capSpend(Number.NaN, 200, 120), 0);
  assert.equal(capSpend(Number.POSITIVE_INFINITY, 200, 120), 0);
});

test("capSpend never returns more than balance even if payable is huge (client can't overspend)", () => {
  assert.equal(capSpend(999999, 75, 999999), 75);
});

// ── canonical idempotency keys (must match the live DB writes) ────────────────
test("idempotency keys are stable and unique per event", () => {
  assert.equal(promoCreditKey("o1", "p1"), "promo-credit:o1:p1");
  assert.equal(promoReversalKey("o1", "p1"), "promo-reversal:o1:p1:1");
  assert.equal(promoReversalKey("o1", "p1", 2), "promo-reversal:o1:p1:2");
  assert.equal(orderSpendKey("o1"), "credit-spend:o1");
  assert.equal(orderRefundKey("o1"), "credit-refund:o1");
  assert.equal(manualCreditKey("req-9"), "manual-credit:req-9");
  assert.equal(walletExpireKey("c1", "2026-09-01T00:00:00.000Z"), "wallet-expire:c1:2026-09-01T00:00:00.000Z");
});

test("one spend and one refund key per order (prevents double spend/refund via unique constraint)", () => {
  // Same order → same key → DB unique index makes the second write a no-op.
  assert.equal(orderSpendKey("o42"), orderSpendKey("o42"));
  assert.equal(orderRefundKey("o42"), orderRefundKey("o42"));
});

// ── promo reversal math (refunds) ────────────────────────────────────────────
test("percentage promo credit reversal is proportional to refunded eligible amount", () => {
  // granted 30 on 300 eligible; refund 100 eligible → reverse 10
  assert.equal(
    computeCreditReversal({ rewardType: "PERCENT_GHOST_CREDIT", grantedCreditMad: 30, eligibleSubtotalMad: 300, refundedEligibleMad: 100 }),
    10,
  );
});

test("fixed promo credit reverses fully only when all eligible refunded", () => {
  assert.equal(
    computeCreditReversal({ rewardType: "FIXED_GHOST_CREDIT", grantedCreditMad: 25, eligibleSubtotalMad: 300, refundedEligibleMad: 300 }),
    25,
  );
  assert.equal(
    computeCreditReversal({ rewardType: "FIXED_GHOST_CREDIT", grantedCreditMad: 25, eligibleSubtotalMad: 300, refundedEligibleMad: 150 }),
    13,
  );
});

test("reversal never exceeds the granted amount", () => {
  const r = computeCreditReversal({ rewardType: "PERCENT_GHOST_CREDIT", grantedCreditMad: 30, eligibleSubtotalMad: 300, refundedEligibleMad: 10000 });
  assert.ok(r <= 30);
});

// ── issuance amount from eligible subtotal (rounding once) ────────────────────
test("percentage credit computed from eligible subtotal with single rounding", () => {
  assert.equal(computeGhostCredit({ rewardType: "PERCENT_GHOST_CREDIT", percentValue: 10 }, 305), 31); // 30.5 → 31
  assert.equal(computeGhostCredit({ rewardType: "PERCENT_GHOST_CREDIT", percentValue: 10, maxCreditMad: 20 }, 305), 20); // cap
});
