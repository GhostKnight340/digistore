// Promo engine — pure unit tests. No DB, no network, no secrets.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizePromoCode,
  roundMad,
  validatePromoConfig,
  computeEligibility,
  computeDiscount,
  computeGhostCredit,
  allocateDiscount,
  evaluatePromoStatus,
  validateRedeemability,
  computeCreditReversal,
  refundableLineAmount,
  promoCreditIdempotencyKey,
  rewardKind,
  type EligibilityLine,
  type RedeemablePromo,
} from "../../src/lib/promo/engine";

const now = new Date("2026-07-14T12:00:00Z");

function line(lineId: string, productId: string, categoryId: string | null, unitPriceMad: number, quantity = 1): EligibilityLine {
  return { lineId, productId, categoryId, unitPriceMad, quantity };
}

// ── normalization ────────────────────────────────────────────────────────────
test("normalizePromoCode trims, strips spaces, uppercases", () => {
  assert.equal(normalizePromoCode("  ghost 10 "), "GHOST10");
  assert.equal(normalizePromoCode("Ghost-Credit_20"), "GHOST-CREDIT_20");
});

test("roundMad rounds to nearest dirham", () => {
  assert.equal(roundMad(20.4), 20);
  assert.equal(roundMad(20.5), 21);
});

// ── config validation (VALIDATION RULES section) ─────────────────────────────
test("rejects percentage discount <= 0 and > 100", () => {
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_DISCOUNT", percentValue: 0 }).ok, false);
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_DISCOUNT", percentValue: 101 }).ok, false);
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_DISCOUNT", percentValue: 10 }).ok, true);
});

test("rejects fixed discount <= 0, fixed credit <= 0, credit pct out of range", () => {
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "FIXED_DISCOUNT", fixedAmountMad: 0 }).ok, false);
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "FIXED_GHOST_CREDIT", fixedAmountMad: -5 }).ok, false);
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_GHOST_CREDIT", percentValue: 0 }).ok, false);
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_GHOST_CREDIT", percentValue: 100, maxCreditMad: 50 }).ok, true);
});

test("rejects max caps <= 0, end before start, and per-customer > total", () => {
  assert.equal(validatePromoConfig({ code: "A", internalName: "n", rewardType: "PERCENT_DISCOUNT", percentValue: 10, maxDiscountMad: 0 }).ok, false);
  assert.equal(
    validatePromoConfig({ code: "A", internalName: "n", rewardType: "FIXED_DISCOUNT", fixedAmountMad: 10, startAt: "2026-07-10", endAt: "2026-07-01" }).ok,
    false,
  );
  assert.equal(
    validatePromoConfig({ code: "A", internalName: "n", rewardType: "FIXED_DISCOUNT", fixedAmountMad: 10, maxTotalUses: 5, maxUsesPerCustomer: 6 }).ok,
    false,
  );
});

// ── eligibility & OR matching (tests 7,8,9,10,11) ────────────────────────────
test("no restrictions → all lines eligible", () => {
  const lines = [line("a", "steam", "gaming", 200), line("b", "netflix", "streaming", 150)];
  const r = computeEligibility(lines, { productIds: [], categoryIds: [] });
  assert.deepEqual(r.eligibleLineIds, ["a", "b"]);
  assert.equal(r.eligibleSubtotalMad, 350);
});

test("restricted to one parent product", () => {
  const lines = [line("a", "steam", "gaming", 200), line("b", "netflix", "streaming", 150)];
  const r = computeEligibility(lines, { productIds: ["steam"], categoryIds: [] });
  assert.deepEqual(r.eligibleLineIds, ["a"]);
  assert.equal(r.eligibleSubtotalMad, 200);
});

test("restricted to one category", () => {
  const lines = [line("a", "steam", "gaming", 200), line("b", "netflix", "streaming", 150)];
  const r = computeEligibility(lines, { productIds: [], categoryIds: ["gaming"] });
  assert.deepEqual(r.eligibleLineIds, ["a"]);
  assert.equal(r.eligibleSubtotalMad, 200);
});

test("both products and categories use OR matching", () => {
  const lines = [
    line("a", "steam", "gaming", 200),
    line("b", "netflix", "streaming", 150),
    line("c", "spotify", "music", 100),
  ];
  // product spotify OR category gaming → steam (cat) + spotify (product)
  const r = computeEligibility(lines, { productIds: ["spotify"], categoryIds: ["gaming"] });
  assert.deepEqual(r.eligibleLineIds.sort(), ["a", "c"]);
  assert.equal(r.eligibleSubtotalMad, 300);
});

// ── discount computation (tests 1,2,5,10,12) ─────────────────────────────────
test("percentage discount for all products", () => {
  assert.equal(computeDiscount({ rewardType: "PERCENT_DISCOUNT", percentValue: 10 }, 350), 35);
});

test("percentage discount with max cap", () => {
  assert.equal(computeDiscount({ rewardType: "PERCENT_DISCOUNT", percentValue: 50, maxDiscountMad: 30 }, 200), 30);
});

test("fixed discount never exceeds eligible subtotal", () => {
  assert.equal(computeDiscount({ rewardType: "FIXED_DISCOUNT", fixedAmountMad: 500 }, 200), 200);
  assert.equal(computeDiscount({ rewardType: "FIXED_DISCOUNT", fixedAmountMad: 50 }, 200), 50);
});

test("mixed cart applies percentage discount only to eligible subtotal", () => {
  // eligible subtotal 200 (Steam), 10% => 20 (not 35 on the 350 total)
  assert.equal(computeDiscount({ rewardType: "PERCENT_DISCOUNT", percentValue: 10 }, 200), 20);
});

// ── ghost credit computation (tests 3,4,6,11) ────────────────────────────────
test("fixed ghost credit amount", () => {
  assert.equal(computeGhostCredit({ rewardType: "FIXED_GHOST_CREDIT", fixedAmountMad: 25 }, 300), 25);
});

test("percentage ghost credit from eligible subtotal only", () => {
  // PlayStation 300 eligible, Netflix 200 not → 10% of 300 = 30 (not 50)
  assert.equal(computeGhostCredit({ rewardType: "PERCENT_GHOST_CREDIT", percentValue: 10 }, 300), 30);
});

test("percentage ghost credit with max cap", () => {
  assert.equal(computeGhostCredit({ rewardType: "PERCENT_GHOST_CREDIT", percentValue: 10, maxCreditMad: 20 }, 300), 20);
});

test("credit types return 0 discount and discount types return 0 credit", () => {
  assert.equal(computeDiscount({ rewardType: "FIXED_GHOST_CREDIT", fixedAmountMad: 25 }, 300), 0);
  assert.equal(computeGhostCredit({ rewardType: "PERCENT_DISCOUNT", percentValue: 10 }, 300), 0);
  assert.equal(rewardKind("PERCENT_GHOST_CREDIT"), "credit");
  assert.equal(rewardKind("FIXED_DISCOUNT"), "discount");
});

// ── deterministic allocation ─────────────────────────────────────────────────
test("allocation sums exactly to the discount and is deterministic", () => {
  const lines = [line("a", "p1", "c", 100), line("b", "p2", "c", 200), line("c3", "p3", "c", 33)];
  const alloc = allocateDiscount(50, lines);
  const total = alloc.reduce((s, a) => s + a.discountMad, 0);
  assert.equal(total, 50);
  // Re-running yields identical allocation.
  assert.deepEqual(allocateDiscount(50, lines), alloc);
});

test("allocation never exceeds a line subtotal", () => {
  const lines = [line("a", "p1", "c", 10), line("b", "p2", "c", 10)];
  const alloc = allocateDiscount(20, lines);
  assert.equal(alloc.reduce((s, a) => s + a.discountMad, 0), 20);
  assert.ok(alloc.every((a) => a.discountMad <= 10));
});

// ── status & redeemability (tests 13,14,15,16,18,19,20) ──────────────────────
const basePromo: RedeemablePromo = {
  rewardType: "PERCENT_DISCOUNT",
  active: true,
  archivedAt: null,
  startAt: null,
  endAt: null,
  maxTotalUses: null,
  reservedUses: 0,
  maxUsesPerCustomer: null,
  firstOrderOnly: false,
  loggedInOnly: false,
  minSubtotalMad: null,
  maxSubtotalMad: null,
};
const baseCtx = { now, isLoggedIn: true, isFirstOrder: true, customerUses: 0, eligibleSubtotalMad: 200 };

test("status: scheduled / expired / exhausted / disabled / archived", () => {
  assert.equal(evaluatePromoStatus({ ...basePromo, startAt: "2026-08-01" }, now), "scheduled");
  assert.equal(evaluatePromoStatus({ ...basePromo, endAt: "2026-07-01" }, now), "expired");
  assert.equal(evaluatePromoStatus({ ...basePromo, maxTotalUses: 2, reservedUses: 2 }, now), "exhausted");
  assert.equal(evaluatePromoStatus({ ...basePromo, active: false }, now), "disabled");
  assert.equal(evaluatePromoStatus({ ...basePromo, archivedAt: now }, now), "archived");
  assert.equal(evaluatePromoStatus(basePromo, now), "active");
});

test("promo before start date fails, expired fails, disabled fails", () => {
  assert.equal(validateRedeemability({ ...basePromo, startAt: "2026-08-01" }, baseCtx).ok, false);
  assert.equal(validateRedeemability({ ...basePromo, endAt: "2026-07-01" }, baseCtx).ok, false);
  assert.equal(validateRedeemability({ ...basePromo, active: false }, baseCtx).ok, false);
});

test("minimum eligible subtotal enforcement", () => {
  assert.equal(validateRedeemability({ ...basePromo, minSubtotalMad: 300 }, baseCtx).ok, false);
  assert.equal(validateRedeemability({ ...basePromo, minSubtotalMad: 100 }, baseCtx).ok, true);
});

test("per-customer limit and first-order-only enforcement", () => {
  assert.equal(validateRedeemability({ ...basePromo, maxUsesPerCustomer: 1 }, { ...baseCtx, customerUses: 1 }).ok, false);
  assert.equal(validateRedeemability({ ...basePromo, firstOrderOnly: true }, { ...baseCtx, isFirstOrder: false }).ok, false);
});

test("guest cannot use a Ghost Credit promo without logging in", () => {
  const r = validateRedeemability({ ...basePromo, rewardType: "FIXED_GHOST_CREDIT" }, { ...baseCtx, isLoggedIn: false });
  assert.equal(r.ok, false);
  assert.match(r.error!, /Connectez-vous/);
});

// ── refund / reversal (tests 26,27,28) ───────────────────────────────────────
test("refund uses discounted line amount", () => {
  assert.equal(refundableLineAmount(200, 20), 180);
  assert.equal(refundableLineAmount(200, 0), 200);
});

test("full refund reverses all promotional ghost credit", () => {
  const r = computeCreditReversal({ rewardType: "PERCENT_GHOST_CREDIT", grantedCreditMad: 30, eligibleSubtotalMad: 300, refundedEligibleMad: 300, percentValue: 10 });
  assert.equal(r, 30);
});

test("partial refund reverses proportional percentage ghost credit", () => {
  // refunded 100 of 300 eligible → 1/3 of 30 = 10
  const r = computeCreditReversal({ rewardType: "PERCENT_GHOST_CREDIT", grantedCreditMad: 30, eligibleSubtotalMad: 300, refundedEligibleMad: 100, percentValue: 10 });
  assert.equal(r, 10);
});

test("fixed ghost credit: full reversal only when all eligible refunded, else prorated", () => {
  assert.equal(computeCreditReversal({ rewardType: "FIXED_GHOST_CREDIT", grantedCreditMad: 25, eligibleSubtotalMad: 300, refundedEligibleMad: 300 }), 25);
  assert.equal(computeCreditReversal({ rewardType: "FIXED_GHOST_CREDIT", grantedCreditMad: 25, eligibleSubtotalMad: 300, refundedEligibleMad: 150 }), 13);
});

// ── combined mixed-cart end-to-end (spec tests 10 & 11) ──────────────────────
test("mixed cart: immediate discount applies only to eligible items (350 → 330)", () => {
  const lines = [line("a", "steam", "gaming", 200), line("b", "netflix", "streaming", 150)];
  const elig = computeEligibility(lines, { productIds: [], categoryIds: ["gaming"] });
  const discount = computeDiscount({ rewardType: "PERCENT_DISCOUNT", percentValue: 10 }, elig.eligibleSubtotalMad);
  const cartTotal = 350;
  assert.equal(elig.eligibleSubtotalMad, 200);
  assert.equal(discount, 20);
  assert.equal(cartTotal - discount, 330);
});

test("mixed cart: percentage Ghost Credit computed only from eligible items (30, pay 500)", () => {
  const lines = [line("a", "ps", "gaming", 300), line("b", "netflix", "streaming", 200)];
  const elig = computeEligibility(lines, { productIds: [], categoryIds: ["gaming"] });
  const credit = computeGhostCredit({ rewardType: "PERCENT_GHOST_CREDIT", percentValue: 10 }, elig.eligibleSubtotalMad);
  assert.equal(elig.eligibleSubtotalMad, 300);
  assert.equal(credit, 30); // not 50
});

test("archived beats disabled in status precedence", () => {
  assert.equal(evaluatePromoStatus({ ...basePromo, active: false, archivedAt: now }, now), "archived");
});

// ── idempotency key (test 24) ────────────────────────────────────────────────
test("promo credit idempotency key is stable", () => {
  assert.equal(promoCreditIdempotencyKey("order1", "promo1"), "promo-credit:order1:promo1");
});
