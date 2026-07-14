// Spending milestones + qualifying-expiry decision — pure unit tests. No DB.
// The DB layer imports these same functions, so the tested logic is the live
// logic. Concurrency/idempotency at the DB level (unique grants, FOR UPDATE) is
// documented in docs/wallet-audit.md / docs/ghost-credit-milestones.md.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  milestonesToGrant,
  milestonesToReverse,
  computeMilestoneProgress,
  isMilestoneLive,
  type MilestoneRule,
} from "../../src/lib/promo/milestones";
import {
  computeExpiryDecision,
  milestoneGrantKey,
  milestoneReversalKey,
  expiryReminderKey,
} from "../../src/lib/promo/ledgerMath";

const now = new Date("2026-07-14T12:00:00Z");

function m(id: string, thresholdMad: number, rewardMad: number, over: Partial<MilestoneRule> = {}): MilestoneRule {
  return { id, thresholdMad, rewardMad, active: true, archivedAt: null, startsAt: null, endsAt: null, ...over };
}

const MS = [m("a", 500, 25), m("b", 1000, 60), m("c", 2500, 175)];

// ── grant selection (spec tests 19-23, 33) ───────────────────────────────────
test("below first threshold → nothing to grant", () => {
  assert.deepEqual(milestonesToGrant(MS, 400, new Set(), now), []);
});

test("reaching a milestone grants it; multiple unlocked at 1200 → a + b (not c)", () => {
  const ids = milestonesToGrant(MS, 1200, new Set(), now).map((x) => x.id);
  assert.deepEqual(ids, ["a", "b"]);
});

test("one large order crossing several → grants each, ascending, not already-granted", () => {
  // previous 400, new spend 2700, already granted 'a'
  const ids = milestonesToGrant(MS, 2700, new Set(["a"]), now).map((x) => x.id);
  assert.deepEqual(ids, ["b", "c"]);
});

test("inactive / archived / out-of-window milestones never grant", () => {
  const rules = [
    m("x", 100, 10, { active: false }),
    m("y", 100, 10, { archivedAt: now }),
    m("z", 100, 10, { startsAt: "2026-08-01" }),
    m("w", 100, 10, { endsAt: "2026-07-01" }),
    m("ok", 100, 10),
  ];
  const ids = milestonesToGrant(rules, 5000, new Set(), now).map((r) => r.id);
  assert.deepEqual(ids, ["ok"]);
});

test("isMilestoneLive respects window", () => {
  assert.equal(isMilestoneLive(m("a", 100, 10, { startsAt: "2026-08-01" }), now), false);
  assert.equal(isMilestoneLive(m("a", 100, 10, { endsAt: "2026-07-01" }), now), false);
  assert.equal(isMilestoneLive(m("a", 100, 10), now), true);
});

// ── reversal (spec test 30) ──────────────────────────────────────────────────
test("refund drops spend below thresholds → reverse highest first", () => {
  const granted = [
    { milestoneId: "a", thresholdMad: 500 },
    { milestoneId: "b", thresholdMad: 1000 },
  ];
  // spend now 780 → 1000 no longer qualified; 500 stays
  const ids = milestonesToReverse(granted, 780).map((g) => g.milestoneId);
  assert.deepEqual(ids, ["b"]);
});

test("reversal orders multiple highest threshold first", () => {
  const granted = [
    { milestoneId: "a", thresholdMad: 500 },
    { milestoneId: "b", thresholdMad: 1000 },
    { milestoneId: "c", thresholdMad: 2500 },
  ];
  const ids = milestonesToReverse(granted, 300).map((g) => g.milestoneId);
  assert.deepEqual(ids, ["c", "b", "a"]);
});

// ── progress (spec tests 36, 37) ─────────────────────────────────────────────
test("progress reports next milestone + remaining", () => {
  const p = computeMilestoneProgress(MS, 320, new Set(), now);
  assert.equal(p.next?.thresholdMad, 500);
  assert.equal(p.next?.remainingMad, 180);
  assert.equal(p.allUnlocked, false);
});

test("progress: all unlocked when every live milestone is granted", () => {
  const p = computeMilestoneProgress(MS, 3000, new Set(["a", "b", "c"]), now);
  assert.equal(p.next, null);
  assert.equal(p.allUnlocked, true);
});

// ── expiry-reset decision (spec tests 1-10) ──────────────────────────────────
test("qualifying reward resets timer to now + inactivityDays and marks qualifying", () => {
  const d = computeExpiryDecision({ resetsExpiration: true, currentExpiresAt: null, now, inactivityDays: 180 });
  assert.equal(d.markQualifying, true);
  assert.equal(d.changeExpiry, true);
  assert.equal(d.newExpiresAt!.toISOString(), new Date(now.getTime() + 180 * 86400000).toISOString());
});

test("non-qualifying grant with an existing cycle preserves the deadline (no change, not qualifying)", () => {
  const existing = new Date("2026-10-10T00:00:00Z");
  const d = computeExpiryDecision({ resetsExpiration: false, currentExpiresAt: existing, now, inactivityDays: 180 });
  assert.equal(d.markQualifying, false);
  assert.equal(d.changeExpiry, false);
});

test("non-qualifying grant into a wallet with no cycle seeds a default deadline but not qualifying", () => {
  const d = computeExpiryDecision({ resetsExpiration: false, currentExpiresAt: null, now, inactivityDays: 180 });
  assert.equal(d.markQualifying, false);
  assert.equal(d.changeExpiry, true);
  assert.ok(d.newExpiresAt);
});

test("configurable inactivity period is honored", () => {
  const d = computeExpiryDecision({ resetsExpiration: true, currentExpiresAt: null, now, inactivityDays: 90 });
  assert.equal(d.newExpiresAt!.toISOString(), new Date(now.getTime() + 90 * 86400000).toISOString());
});

// ── idempotency keys ─────────────────────────────────────────────────────────
test("milestone + reminder keys are stable and unique per event", () => {
  assert.equal(milestoneGrantKey("mid", "cid"), "spending-milestone:mid:cid");
  assert.equal(milestoneReversalKey("mid", "cid"), "spending-milestone-reversal:mid:cid");
  assert.equal(expiryReminderKey("cid", "2027-01-18T00:00:00.000Z"), "ghost-credit-expiry-reminder:cid:2027-01-18T00:00:00.000Z");
});
