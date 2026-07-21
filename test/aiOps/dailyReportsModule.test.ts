// Daily Reports — module security guards + registry consistency (spec: safe
// tool usage, tool permissions). The module body imports server-only code
// (callTool/runner), so its guarantees are asserted at the source level, exactly
// like discordAssistantModule.test.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEFAULT_TOOL_GRANTS } from "../../src/lib/ai-ops/types";
import { REPORT_TYPES, REPORT_DEFINITIONS } from "../../src/lib/ai-ops/reports/reportTypes";
import { parseCron } from "../../src/lib/ai-ops/reports/reportSchedule";

// ─── Registry consistency ────────────────────────────────────────────────────

test("there are exactly four report types with definitions", () => {
  assert.equal(REPORT_TYPES.length, 4);
  for (const type of REPORT_TYPES) {
    assert.ok(REPORT_DEFINITIONS[type], `${type} has a definition`);
  }
});

test("every report only uses tools the daily_reports module is granted", () => {
  const granted = new Set<string>(DEFAULT_TOOL_GRANTS.daily_reports);
  for (const type of REPORT_TYPES) {
    for (const tool of REPORT_DEFINITIONS[type].tools) {
      assert.ok(granted.has(tool), `${type} uses ${tool} which is not a daily_reports grant`);
    }
  }
});

test("every report's default schedule is a valid cron", () => {
  for (const type of REPORT_TYPES) {
    assert.ok(parseCron(REPORT_DEFINITIONS[type].defaultSchedule), `${type} default schedule must parse`);
  }
});

// ─── Source-level security guards ────────────────────────────────────────────

const MODULE_SRC = readFileSync("src/lib/ai-ops/modules/dailyReports.ts", "utf8");
const METRICS_SRC = readFileSync("src/lib/ai-ops/reports/metrics.ts", "utf8");

test("the module never imports Prisma directly — it reads via the safe tool layer", () => {
  for (const src of [MODULE_SRC, METRICS_SRC]) {
    assert.ok(!/@\/lib\/db\/prisma/.test(src), "must not import the prisma client");
    assert.ok(!/from ["']@prisma\/client["']/.test(src), "must not import prisma client pkg");
  }
  assert.ok(/callTool\(/.test(METRICS_SRC), "metrics must read data through callTool");
});

test("the module runs through the guarded runner (global switch/budget/logging)", () => {
  assert.ok(/runModule\(/.test(MODULE_SRC), "must execute via runModule");
});

test("the module never imports discord.js (that lives only in the worker)", () => {
  assert.ok(!/discord\.js/.test(MODULE_SRC), "app module must not pull in discord.js");
});

test("the cron route dispatches the reports alongside the base scheduler", () => {
  const src = readFileSync("src/app/api/cron/ai-ops/route.ts", "utf8");
  assert.ok(/dispatchDueReports/.test(src), "cron must call the report dispatcher");
});

test("the assistant endpoint routes report commands on demand", () => {
  const src = readFileSync("src/app/api/discord/assistant/route.ts", "utf8");
  assert.ok(/parseReportCommand/.test(src), "endpoint must parse report commands");
  assert.ok(/generateReport\(/.test(src), "endpoint must generate the report");
});
