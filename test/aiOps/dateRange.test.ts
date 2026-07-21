// AI Operations — timezone-aware date-range resolution (Africa/Casablanca).
// Pure, deterministic (now injected). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveDateRange,
  DATE_PRESETS,
  DEFAULT_TIMEZONE,
} from "../../src/lib/ai-ops/dateRange";

const TZ = "Africa/Casablanca"; // UTC+1 in July (no DST outside Ramadan)
const DAY = 24 * 60 * 60 * 1000;
// 2026-07-21 11:30 local (Tuesday).
const NOW = new Date("2026-07-21T10:30:00.000Z");

function range(input: Parameters<typeof resolveDateRange>[0]) {
  const r = resolveDateRange(input, { now: NOW, timeZone: TZ });
  assert.ok(r.ok, `expected ok, got ${!r.ok && r.error}`);
  return r.ok ? r.range : (undefined as never);
}

test("today = local midnight (Casablanca) to now", () => {
  const r = range({ preset: "today" });
  assert.equal(r.start.toISOString(), "2026-07-20T23:00:00.000Z"); // 00:00 local +1
  assert.equal(r.end.toISOString(), NOW.toISOString());
  assert.match(r.label, /today \(2026-07-21\)/);
});

test("yesterday = the full previous local day", () => {
  const r = range({ preset: "yesterday" });
  assert.equal(r.start.toISOString(), "2026-07-19T23:00:00.000Z");
  assert.equal(r.end.toISOString(), "2026-07-20T23:00:00.000Z");
});

test("this_month starts at local midnight of the 1st, ends now", () => {
  const r = range({ preset: "this_month" });
  assert.equal(r.start.toISOString(), "2026-06-30T23:00:00.000Z"); // 2026-07-01 00:00 local
  assert.equal(r.end.toISOString(), NOW.toISOString());
});

test("last_month spans the previous calendar month, local-aligned", () => {
  const r = range({ preset: "last_month" });
  assert.equal(r.start.toISOString(), "2026-05-31T23:00:00.000Z"); // 2026-06-01 00:00 local
  assert.equal(r.end.toISOString(), "2026-06-30T23:00:00.000Z"); // 2026-07-01 00:00 local
});

test("this_week is Monday-aligned local midnight up to now", () => {
  const r = range({ preset: "this_week" });
  assert.equal(r.end.toISOString(), NOW.toISOString());
  // Local midnight in +1 zone lands on 23:00:00Z the prior day.
  assert.equal(r.start.getUTCHours(), 23);
  assert.equal(r.start.getUTCMinutes(), 0);
  assert.ok(r.start <= NOW && NOW.getTime() - r.start.getTime() < 7 * DAY);
});

test("last_week is the full 7-day week immediately before this_week", () => {
  const thisWeek = range({ preset: "this_week" });
  const lastWeek = range({ preset: "last_week" });
  assert.equal(lastWeek.end.toISOString(), thisWeek.start.toISOString()); // contiguous
  assert.equal(lastWeek.end.getTime() - lastWeek.start.getTime(), 7 * DAY); // exactly a week
});

test("last_7_days is a rolling 7×24h window ending now", () => {
  const r = range({ preset: "last_7_days" });
  assert.equal(r.end.toISOString(), NOW.toISOString());
  assert.equal(r.start.toISOString(), new Date(NOW.getTime() - 7 * DAY).toISOString());
});

test("custom range: inclusive dates → [startMidnight, dayAfterEndMidnight)", () => {
  const r = range({ start: "2026-07-01", end: "2026-07-15" });
  assert.equal(r.start.toISOString(), "2026-06-30T23:00:00.000Z"); // 07-01 00:00 local
  assert.equal(r.end.toISOString(), "2026-07-15T23:00:00.000Z"); // 07-16 00:00 local (exclusive)
  assert.equal(r.kind, "custom");
});

test("custom single-day range is valid (start == end)", () => {
  const r = range({ start: "2026-07-10", end: "2026-07-10" });
  assert.equal(r.end.getTime() - r.start.getTime(), DAY);
});

test("custom range rejects bad format, impossible dates, inversion, and overflow", () => {
  const bad = (input: Parameters<typeof resolveDateRange>[0]) =>
    resolveDateRange(input, { now: NOW, timeZone: TZ });
  assert.equal(bad({ start: "2026/07/01", end: "2026-07-02" }).ok, false);
  assert.equal(bad({ start: "2026-02-30", end: "2026-03-01" }).ok, false); // impossible day
  assert.equal(bad({ start: "2026-07-15", end: "2026-07-01" }).ok, false); // end < start
  assert.equal(bad({ start: "2020-01-01", end: "2026-07-01" }).ok, false); // > 366 days
});

test("unknown preset is rejected", () => {
  // @ts-expect-error deliberately invalid preset
  assert.equal(resolveDateRange({ preset: "next_year" }, { now: NOW, timeZone: TZ }).ok, false);
});

test("default timezone is Africa/Casablanca when omitted", () => {
  assert.equal(DEFAULT_TIMEZONE, "Africa/Casablanca");
  const r = resolveDateRange({ preset: "today" }, { now: NOW }); // no timeZone
  assert.ok(r.ok && r.range.start.toISOString() === "2026-07-20T23:00:00.000Z");
});

test("every declared preset resolves to a non-empty, ordered range", () => {
  for (const preset of DATE_PRESETS) {
    const r = range({ preset });
    assert.ok(r.start < r.end, `${preset}: start must precede end`);
    assert.ok(typeof r.label === "string" && r.label.length > 0);
  }
});
