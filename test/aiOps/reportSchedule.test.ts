// Daily Reports — cron parsing, timezone handling, and the "is this report due?"
// decision (spec: scheduler, timezone handling). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCron,
  zonedParts,
  cronMatchesHour,
  reportIdempotencyKey,
  isReportDue,
  nextFiringTime,
} from "../../src/lib/ai-ops/reports/reportSchedule";

const NO_LOCK = { lockedAt: null, lockExpiresAt: null };

// ─── parseCron ───────────────────────────────────────────────────────────────

test("parseCron parses a 5-field expression into sets / wildcards", () => {
  const c = parseCron("0 8 * * *");
  assert.ok(c);
  assert.deepEqual([...c!.minute!], [0]);
  assert.deepEqual([...c!.hour!], [8]);
  assert.equal(c!.dom, null);
  assert.equal(c!.month, null);
  assert.equal(c!.dow, null);
});

test("parseCron supports lists, ranges, and steps", () => {
  const c = parseCron("0 */6 * * 1-5");
  assert.ok(c);
  assert.deepEqual([...c!.hour!].sort((a, b) => a - b), [0, 6, 12, 18]);
  assert.deepEqual([...c!.dow!].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("parseCron normalizes day-of-week 7 to 0 (Sunday)", () => {
  const c = parseCron("0 9 * * 7");
  assert.ok(c!.dow!.has(0));
});

test("parseCron rejects malformed expressions", () => {
  assert.equal(parseCron(""), null);
  assert.equal(parseCron("0 8 * *"), null); // 4 fields
  assert.equal(parseCron("99 8 * * *"), null); // minute out of range
  assert.equal(parseCron("0 8 * * abc"), null);
});

// ─── timezone ────────────────────────────────────────────────────────────────

test("zonedParts converts UTC to a timezone's wall clock", () => {
  const p = zonedParts(new Date("2026-07-21T07:00:00Z"), "Africa/Casablanca");
  // Morocco is UTC+1 in July → 07:00 UTC is 08:00 local.
  assert.equal(p.hour, 8);
  assert.equal(p.day, 21);
  assert.equal(p.month, 7);
});

test("an unknown timezone falls back to UTC parts (never throws)", () => {
  const p = zonedParts(new Date("2026-07-21T07:00:00Z"), "Not/AZone");
  assert.equal(p.hour, 7);
});

// ─── cronMatchesHour ─────────────────────────────────────────────────────────

test("cronMatchesHour matches the scheduled hour once the minute has passed", () => {
  const cron = parseCron("0 8 * * *")!;
  assert.equal(cronMatchesHour(cron, zonedParts(new Date("2026-07-21T08:00:00Z"), "UTC")), true);
  assert.equal(cronMatchesHour(cron, zonedParts(new Date("2026-07-21T08:14:00Z"), "UTC")), true);
  assert.equal(cronMatchesHour(cron, zonedParts(new Date("2026-07-21T09:00:00Z"), "UTC")), false);
});

test("cronMatchesHour honors day-of-week (weekly) and day-of-month (monthly)", () => {
  const weekly = parseCron("0 9 * * 1")!; // Monday
  assert.equal(cronMatchesHour(weekly, zonedParts(new Date("2026-07-20T09:00:00Z"), "UTC")), true); // Mon
  assert.equal(cronMatchesHour(weekly, zonedParts(new Date("2026-07-21T09:00:00Z"), "UTC")), false); // Tue

  const monthly = parseCron("0 9 1 * *")!; // 1st of the month
  assert.equal(cronMatchesHour(monthly, zonedParts(new Date("2026-08-01T09:00:00Z"), "UTC")), true);
  assert.equal(cronMatchesHour(monthly, zonedParts(new Date("2026-08-02T09:00:00Z"), "UTC")), false);
});

// ─── idempotency ─────────────────────────────────────────────────────────────

test("idempotency key is stable within the scheduled hour, distinct across hours/days", () => {
  const cron = parseCron("0 8 * * *")!;
  const a = reportIdempotencyKey("morning", cron, zonedParts(new Date("2026-07-21T08:00:00Z"), "UTC"));
  const b = reportIdempotencyKey("morning", cron, zonedParts(new Date("2026-07-21T08:14:00Z"), "UTC"));
  const c = reportIdempotencyKey("morning", cron, zonedParts(new Date("2026-07-22T08:00:00Z"), "UTC"));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ─── isReportDue ─────────────────────────────────────────────────────────────

const DUE_STATE = { enabled: true, schedule: "0 8 * * *", lastIdempotencyKey: null, lock: NO_LOCK };

test("a report matching its cron with no prior run is due", () => {
  const d = isReportDue("morning", DUE_STATE, "UTC", new Date("2026-07-21T08:00:00Z"));
  assert.equal(d.shouldRun, true);
  assert.ok(d.idempotencyKey);
});

test("a disabled report is never due", () => {
  const d = isReportDue("morning", { ...DUE_STATE, enabled: false }, "UTC", new Date("2026-07-21T08:00:00Z"));
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "disabled");
});

test("outside the scheduled hour the report is not due", () => {
  const d = isReportDue("morning", DUE_STATE, "UTC", new Date("2026-07-21T10:00:00Z"));
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "not_scheduled");
});

test("the same firing already run is a duplicate and skipped", () => {
  const key = reportIdempotencyKey(
    "morning",
    parseCron("0 8 * * *")!,
    zonedParts(new Date("2026-07-21T08:00:00Z"), "UTC"),
  );
  const d = isReportDue(
    "morning",
    { ...DUE_STATE, lastIdempotencyKey: key },
    "UTC",
    new Date("2026-07-21T08:14:00Z"),
  );
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "duplicate");
});

test("a live lock defers the run", () => {
  const now = new Date("2026-07-21T08:00:00Z");
  const d = isReportDue(
    "morning",
    { ...DUE_STATE, lock: { lockedAt: now, lockExpiresAt: new Date(now.getTime() + 60_000) } },
    "UTC",
    now,
  );
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "locked");
});

test("a malformed schedule is reported, never crashes the pass", () => {
  const d = isReportDue("morning", { ...DUE_STATE, schedule: "not a cron" }, "UTC", new Date());
  assert.equal(d.shouldRun, false);
  assert.equal(d.skipReason, "bad_schedule");
});

test("timezone-aware: 08:00 Casablanca fires at 07:00 UTC, not 08:00 UTC", () => {
  const state = { ...DUE_STATE, schedule: "0 8 * * *" };
  assert.equal(isReportDue("morning", state, "Africa/Casablanca", new Date("2026-07-21T07:00:00Z")).shouldRun, true);
  assert.equal(isReportDue("morning", state, "Africa/Casablanca", new Date("2026-07-21T08:00:00Z")).shouldRun, false);
});

// ─── nextFiringTime ──────────────────────────────────────────────────────────

test("nextFiringTime finds the next daily firing", () => {
  const next = nextFiringTime("0 8 * * *", "UTC", new Date("2026-07-21T09:00:00Z"));
  assert.ok(next);
  assert.equal(next!.toISOString(), "2026-07-22T08:00:00.000Z");
});

test("nextFiringTime finds the next monthly firing", () => {
  const next = nextFiringTime("0 9 1 * *", "UTC", new Date("2026-07-21T09:00:00Z"));
  assert.ok(next);
  assert.equal(next!.toISOString(), "2026-08-01T09:00:00.000Z");
});

test("nextFiringTime returns null for a malformed cron", () => {
  assert.equal(nextFiringTime("nope", "UTC"), null);
});
