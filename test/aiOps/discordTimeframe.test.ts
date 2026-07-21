// AI Operations — CEO-assistant timeframe parsing + windowing.
// Pure, deterministic (time injected). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseTimeframe,
  timeframeWindow,
  questionWindow,
} from "../../src/lib/ai-ops/discord/timeframe";

test("defaults to today for a plain question", () => {
  assert.equal(parseTimeframe("How are sales?"), "today");
  assert.equal(parseTimeframe("show today's revenue"), "today");
});

test("recognizes yesterday in English and French", () => {
  assert.equal(parseTimeframe("how were sales yesterday?"), "yesterday");
  assert.equal(parseTimeframe("les ventes d'hier ?"), "yesterday");
});

test("recognizes week / 7-day phrasings (EN + FR)", () => {
  assert.equal(parseTimeframe("sales this week"), "last_7_days");
  assert.equal(parseTimeframe("last 7 days revenue"), "last_7_days");
  assert.equal(parseTimeframe("les ventes de la semaine"), "last_7_days");
});

test("recognizes this month and last month distinctly", () => {
  assert.equal(parseTimeframe("revenue this month"), "this_month");
  assert.equal(parseTimeframe("ce mois-ci"), "this_month");
  assert.equal(parseTimeframe("how did we do last month?"), "last_month");
  assert.equal(parseTimeframe("le mois dernier"), "last_month");
});

test("more specific phrases win over broader ones", () => {
  // "yesterday" must not be swallowed by a generic match.
  assert.equal(parseTimeframe("and yesterday, this week?"), "yesterday");
  // "last month" must beat "this month".
  assert.equal(parseTimeframe("last month vs this month"), "last_month");
});

test("today window is the last day, no upper bound", () => {
  const w = timeframeWindow("today");
  assert.deepEqual({ periodDays: w.periodDays, untilDays: w.untilDays }, { periodDays: 1, untilDays: 0 });
});

test("yesterday window is a bounded past day (untilDays > 0)", () => {
  const w = timeframeWindow("yesterday");
  assert.equal(w.periodDays, 2);
  assert.equal(w.untilDays, 1);
  assert.ok(w.untilDays > 0, "yesterday must have an upper bound in the past");
});

test("this_month window is computed from the calendar month start", () => {
  // 2026-07-21 UTC → ~20–21 days since the 1st.
  const now = Date.UTC(2026, 6, 21, 12, 0, 0);
  const w = timeframeWindow("this_month", now);
  assert.equal(w.untilDays, 0);
  assert.ok(w.periodDays >= 20 && w.periodDays <= 21, `expected ~20-21, got ${w.periodDays}`);
});

test("last_month window ends where this month began", () => {
  const now = Date.UTC(2026, 6, 21, 12, 0, 0); // 21 July
  const w = timeframeWindow("last_month", now);
  // Upper bound ≈ 20-21 days ago (start of July); lower bound ≈ 50-52 days ago (start of June).
  assert.ok(w.untilDays >= 20 && w.untilDays <= 21, `untilDays ~20-21, got ${w.untilDays}`);
  assert.ok(w.periodDays > w.untilDays, "window must be non-empty");
  assert.ok(w.periodDays >= 50 && w.periodDays <= 52, `periodDays ~50-52, got ${w.periodDays}`);
});

test("questionWindow parses then maps in one step", () => {
  const w = questionWindow("sales yesterday", Date.UTC(2026, 6, 21));
  assert.equal(w.label, "yesterday");
  assert.equal(w.untilDays, 1);
});
