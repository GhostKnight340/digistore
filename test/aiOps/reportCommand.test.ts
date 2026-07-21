// Daily Reports — manual "@Ghost CEO … report" command parsing (spec: manual
// commands). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseReportCommand } from "../../src/lib/ai-ops/reports/reportCommand";

test("recognizes each report command (report already stripped of mention/CEO)", () => {
  assert.equal(parseReportCommand("morning report"), "morning");
  assert.equal(parseReportCommand("daily report"), "evening"); // daily = end of day
  assert.equal(parseReportCommand("end of day report"), "evening");
  assert.equal(parseReportCommand("weekly report"), "weekly");
  assert.equal(parseReportCommand("monthly report"), "monthly");
});

test("is case-insensitive and tolerant of extra words", () => {
  assert.equal(parseReportCommand("Give me the MORNING report please"), "morning");
  assert.equal(parseReportCommand("weekly briefing"), "weekly");
});

test("requires the word report/brief so ordinary questions are NOT hijacked", () => {
  assert.equal(parseReportCommand("how were sales weekly vs monthly?"), null);
  assert.equal(parseReportCommand("what is our revenue this morning?"), null);
  assert.equal(parseReportCommand(""), null);
});

test("an ambiguous 'report' with no known period returns null", () => {
  assert.equal(parseReportCommand("send me a report"), null);
});
