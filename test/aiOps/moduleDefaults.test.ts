// AI Operations — the spec-mandated module defaults (§3 execution modes).
// Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { MODULE_DEFINITIONS, MODULE_KEYS } from "../../src/lib/ai-ops/types";

test("the seven modules exist", () => {
  assert.equal(MODULE_KEYS.length, 7);
});

test("default execution modes match the spec exactly", () => {
  assert.equal(MODULE_DEFINITIONS.discord_assistant.defaultMode, "READ_ONLY");
  assert.equal(MODULE_DEFINITIONS.support_assistant.defaultMode, "APPROVAL_REQUIRED");
  assert.equal(MODULE_DEFINITIONS.daily_reports.defaultMode, "AUTONOMOUS");
  assert.equal(MODULE_DEFINITIONS.supplier_intelligence.defaultMode, "READ_ONLY");
  assert.equal(MODULE_DEFINITIONS.meta_ads_intelligence.defaultMode, "READ_ONLY");
  assert.equal(MODULE_DEFINITIONS.business_intelligence.defaultMode, "READ_ONLY");
  assert.equal(MODULE_DEFINITIONS.marketing_assistant.defaultMode, "DRAFT_ONLY");
});

test("the intelligence modules use the base scheduler; daily_reports has its own", () => {
  // daily_reports is scheduled per-report via AiReportSchedule (reportDispatch),
  // not the single base AiScheduledJob — so scheduled:false here on purpose.
  assert.equal(MODULE_DEFINITIONS.daily_reports.scheduled, false);
  assert.equal(MODULE_DEFINITIONS.supplier_intelligence.scheduled, true);
  assert.equal(MODULE_DEFINITIONS.business_intelligence.scheduled, true);
  assert.equal(MODULE_DEFINITIONS.discord_assistant.scheduled, false);
  assert.equal(MODULE_DEFINITIONS.support_assistant.scheduled, false);
});

test("every module has a label and at least one default tool", () => {
  for (const key of MODULE_KEYS) {
    const def = MODULE_DEFINITIONS[key];
    assert.ok(def.label.length > 0, `${key} label`);
    assert.ok(def.defaultTools.length > 0, `${key} tools`);
  }
});
