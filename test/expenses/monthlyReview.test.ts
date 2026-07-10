// End-of-month expense review — pure logic tests. No DB, no network, no Discord.
// Covers the firing gate (business timezone, month boundaries, leap years, the
// year transition), status grouping, the summary + attention list, and the
// idempotency decision (post once; retry after failure).
//
// Run: npm test   (node --conditions=react-server --import tsx --test)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveReviewMoment,
  rangesForMonthKey,
  businessDateParts,
  daysInMonth,
  evaluateClaim,
  buildMonthlyReview,
  reviewGroupOf,
  type ReviewItem,
} from "../../src/lib/expenses/monthlyReview";

const iso = (d: Date) => d.toISOString();

function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    key: overrides.key ?? `entry:${Math.random()}`,
    name: "Service",
    amountOriginal: 20,
    currency: "USD",
    amountMad: 204,
    scheduledDate: "2026-07-10T00:00:00.000Z",
    paidDate: null,
    status: "upcoming",
    isRecurring: false,
    estimated: false,
    ...overrides,
  };
}

// ── daysInMonth + business parts ─────────────────────────────────────────────

test("daysInMonth handles leap and non-leap February and 30/31-day months", () => {
  assert.equal(daysInMonth(2024, 2), 29); // leap
  assert.equal(daysInMonth(2026, 2), 28); // non-leap
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test("businessDateParts reads wall-clock in a fixed-offset zone", () => {
  // Etc/GMT-1 is UTC+1 with no DST — deterministic regardless of Ramadan rules.
  const parts = businessDateParts(new Date("2026-07-31T23:30:00.000Z"), "Etc/GMT-1");
  assert.deepEqual(parts, { year: 2026, month: 8, day: 1, hour: 0 });
});

// ── resolveReviewMoment: firing gate + ranges ────────────────────────────────

test("scenario: fires on the last day at/after the send hour", () => {
  const m = resolveReviewMoment(new Date("2026-07-31T20:00:00.000Z"), "UTC", 20);
  assert.equal(m.shouldFire, true);
  assert.equal(m.isLastDay, true);
  assert.equal(m.monthKey, "2026-07");
  assert.equal(iso(m.ranges.monthStart), "2026-07-01T00:00:00.000Z");
  assert.equal(iso(m.ranges.monthEnd), "2026-08-01T00:00:00.000Z");
  assert.equal(iso(m.ranges.nextMonthStart), "2026-08-01T00:00:00.000Z");
  assert.equal(iso(m.ranges.nextMonthEnd), "2026-09-01T00:00:00.000Z");
});

test("does not fire before the send hour, or on a non-last day", () => {
  assert.equal(resolveReviewMoment(new Date("2026-07-31T19:00:00.000Z"), "UTC", 20).shouldFire, false);
  assert.equal(resolveReviewMoment(new Date("2026-07-30T20:00:00.000Z"), "UTC", 20).shouldFire, false);
});

test("scenario: end-of-year transition December → January", () => {
  const m = resolveReviewMoment(new Date("2026-12-31T21:00:00.000Z"), "UTC", 20);
  assert.equal(m.shouldFire, true);
  assert.equal(m.monthKey, "2026-12");
  assert.equal(iso(m.ranges.monthEnd), "2027-01-01T00:00:00.000Z");
  assert.equal(iso(m.ranges.nextMonthStart), "2027-01-01T00:00:00.000Z");
  assert.equal(iso(m.ranges.nextMonthEnd), "2027-02-01T00:00:00.000Z");
});

test("scenario: February leap vs non-leap last-day detection", () => {
  // Non-leap 2026: Feb 28 is the last day → fires.
  assert.equal(resolveReviewMoment(new Date("2026-02-28T20:00:00.000Z"), "UTC", 20).shouldFire, true);
  // Leap 2024: Feb 28 is NOT the last day (29th is) → does not fire.
  assert.equal(resolveReviewMoment(new Date("2024-02-28T20:00:00.000Z"), "UTC", 20).shouldFire, false);
  // Leap 2024: Feb 29 fires.
  const leap = resolveReviewMoment(new Date("2024-02-29T20:00:00.000Z"), "UTC", 20);
  assert.equal(leap.shouldFire, true);
  assert.equal(leap.monthKey, "2024-02");
});

test("scenario: month boundary is computed in the BUSINESS timezone, not UTC", () => {
  // 19:30Z is 20:30 in UTC+1 on Jul 31 → last day, hour passed → fires for July.
  const evening = resolveReviewMoment(new Date("2026-07-31T19:30:00.000Z"), "Etc/GMT-1", 20);
  assert.equal(evening.shouldFire, true);
  assert.equal(evening.monthKey, "2026-07");
  // 23:30Z is already 00:30 on Aug 1 locally → NOT the last day; month is August.
  const rollover = resolveReviewMoment(new Date("2026-07-31T23:30:00.000Z"), "Etc/GMT-1", 20);
  assert.equal(rollover.isLastDay, false);
  assert.equal(rollover.shouldFire, false);
  assert.equal(rollover.monthKey, "2026-08");
});

test("rangesForMonthKey mirrors resolveReviewMoment ranges", () => {
  const { ranges } = rangesForMonthKey("2026-12");
  assert.equal(iso(ranges.monthStart), "2026-12-01T00:00:00.000Z");
  assert.equal(iso(ranges.monthEnd), "2027-01-01T00:00:00.000Z");
  assert.equal(iso(ranges.nextMonthEnd), "2027-02-01T00:00:00.000Z");
});

// ── evaluateClaim: idempotency + retry ───────────────────────────────────────

test("scenario: cron runs twice but posts only once", () => {
  assert.equal(evaluateClaim(null).shouldSend, true); // first run sends
  assert.equal(evaluateClaim({ status: "sent" }).shouldSend, false); // second run skips
});

test("scenario: Discord failure followed by a successful retry", () => {
  assert.equal(evaluateClaim({ status: "failed" }).shouldSend, true); // retry allowed
  assert.equal(evaluateClaim({ status: "pending" }).shouldSend, true);
});

// ── reviewGroupOf ────────────────────────────────────────────────────────────

test("status → group mapping", () => {
  assert.equal(reviewGroupOf(item({ status: "paid" })), "paid");
  assert.equal(reviewGroupOf(item({ status: "pending" })), "toConfirm");
  assert.equal(reviewGroupOf(item({ status: "upcoming" })), "pending");
  assert.equal(reviewGroupOf(item({ status: "overdue" })), "overdue");
  assert.equal(reviewGroupOf(item({ status: "subscription_cancelled" })), "terminated");
  assert.equal(reviewGroupOf(item({ status: "subscription_expired" })), "terminated");
  assert.equal(reviewGroupOf(item({ status: "unpaid" })), "ignored");
  assert.equal(reviewGroupOf(item({ status: "not_applicable" })), "ignored");
  // Variable-without-final-amount overrides the raw status.
  assert.equal(reviewGroupOf(item({ status: "pending", estimated: true, amountOriginal: null })), "variableNoFinal");
});

// ── buildMonthlyReview: the 5 ledger scenarios ───────────────────────────────

const base = { monthKey: "2026-07", monthLabel: "juillet 2026", preview: [] as ReviewItem[] };

test("scenario 1: month with all payments confirmed", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [
      item({ key: "entry:a", name: "Vercel Pro", status: "paid", paidDate: "2026-07-10T00:00:00.000Z", amountMad: 204 }),
      item({ key: "entry:b", name: "Bot Discord", status: "paid", paidDate: "2026-07-09T00:00:00.000Z", amountMad: 20 }),
    ],
  });
  assert.equal(model.summary.confirmedCount, 2);
  assert.equal(model.summary.overdueCount, 0);
  assert.equal(model.summary.confirmedMad, 224);
  const paid = model.groups.find((g) => g.key === "paid");
  assert.ok(paid && paid.lines.length === 2);
  assert.match(paid!.lines[0].text, /payée le/);
});

test("scenario 2: month with an overdue expense", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [item({ key: "entry:z", name: "Zoho Mail", status: "overdue", amountOriginal: 12, currency: "USD" })],
  });
  assert.equal(model.summary.overdueCount, 1);
  assert.ok(model.groups.some((g) => g.key === "overdue"));
  assert.ok(model.attention.some((a) => a.includes("Zoho Mail") && a.includes("retard")));
});

test("scenario 3: variable expense with no final amount", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [item({ key: "recur:neon", name: "Neon DB", status: "pending", estimated: true, amountOriginal: null, amountMad: null })],
  });
  assert.equal(model.summary.hasVariable, true);
  const variable = model.groups.find((g) => g.key === "variableNoFinal");
  assert.ok(variable && variable.lines[0].text.includes("montant variable"));
  assert.ok(model.attention.some((a) => a.includes("Neon DB") && a.includes("montant final")));
});

test("scenario 4: subscription cancelled before its billing date", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [item({ key: "recur:old", name: "Ancien service", status: "subscription_cancelled", isRecurring: true, note: "abonnement résilié", scheduledDate: "2026-07-15T00:00:00.000Z" })],
  });
  const terminated = model.groups.find((g) => g.key === "terminated");
  assert.ok(terminated, "expected a terminated group");
  assert.equal(model.summary.terminatedCount, 1);
  assert.ok(terminated!.lines[0].text.includes("abonnement résilié"));
});

test("scenario 5: previously paid occurrence corrected to non-paid", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [item({ key: "entry:corr", name: "Service X", status: "unpaid", corrected: true, paidDate: null })],
  });
  // Never counted as paid; lands in "ignored" with a correction note.
  assert.equal(model.summary.confirmedCount, 0);
  const ignored = model.groups.find((g) => g.key === "ignored");
  assert.ok(ignored, "expected an ignored group");
  assert.equal(ignored!.lines[0].note, "corrigée");
});

test("dedupe merges the corrected/estimated flags across the same key", () => {
  const model = buildMonthlyReview({
    ...base,
    items: [
      item({ key: "entry:dup", name: "Dup", status: "overdue", corrected: false }),
      item({ key: "entry:dup", name: "Dup", status: "overdue", corrected: true }),
    ],
  });
  const overdue = model.groups.find((g) => g.key === "overdue");
  assert.ok(overdue && overdue.lines.length === 1); // collapsed to one line
  assert.equal(overdue!.lines[0].note, "corrigée");
});

test("empty month yields an isEmpty model with a zeroed summary", () => {
  const model = buildMonthlyReview({ ...base, items: [] });
  assert.equal(model.isEmpty, true);
  assert.equal(model.summary.confirmedCount, 0);
  assert.equal(model.groups.length, 0);
});
