// Daily Reports — narrative prompt + structured-output schema (spec: AI usage
// = summaries/recommendations only, no hallucinated numbers). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReportPrompt, REPORT_NARRATIVE_SCHEMA } from "../../src/lib/ai-ops/reports/prompt";

test("the prompt forbids inventing or restating numbers", () => {
  const p = buildReportPrompt("morning", "fr").toLowerCase();
  assert.ok(p.includes("never invent"), "must forbid inventing numbers");
  assert.ok(/not present in `figures`|not present in figures/.test(p), "must forbid figures not in the payload");
});

test("the prompt scopes the AI to prose only (summary/recommendations/trends/priorities)", () => {
  const p = buildReportPrompt("weekly", "en");
  for (const field of ["summary", "recommendations", "trends", "topPriorities"]) {
    assert.ok(p.includes(field), `prompt should describe the ${field} field`);
  }
});

test("the prompt writes prose in the configured language", () => {
  assert.match(buildReportPrompt("morning", "fr"), /French/);
  assert.match(buildReportPrompt("morning", "ar"), /Arabic/);
  assert.match(buildReportPrompt("morning", "en"), /English/);
});

test("the prompt forbids leaking secrets and customer PII", () => {
  const p = buildReportPrompt("monthly", "en").toLowerCase();
  for (const forbidden of ["api key", "environment variable", "schema", "credential", "customer data"]) {
    assert.ok(p.includes(forbidden), `prompt should refuse to reveal: ${forbidden}`);
  }
});

test("operator instructions are appended, not replaced", () => {
  const p = buildReportPrompt("morning", "en", "Keep it under 5 lines.");
  assert.ok(p.includes("NEVER invent"), "hard rules remain");
  assert.ok(p.includes("Keep it under 5 lines."), "extra guidance appended");
});

test("the structured schema requires exactly the four prose fields", () => {
  assert.equal(REPORT_NARRATIVE_SCHEMA.type, "object");
  assert.deepEqual(REPORT_NARRATIVE_SCHEMA.required, ["summary", "recommendations", "trends", "topPriorities"]);
  assert.equal(REPORT_NARRATIVE_SCHEMA.additionalProperties, false);
});
