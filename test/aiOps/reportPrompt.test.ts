// Daily Reports — intelligence-brief prompt + structured-output schema (spec:
// interpretation not KPI dump; numbers quoted verbatim only). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReportPrompt, REPORT_NARRATIVE_SCHEMA, coerceReportNarrative } from "../../src/lib/ai-ops/reports/prompt";
import type { ReportNarrative } from "../../src/lib/ai-ops/reports/prompt";

test("the prompt forbids a KPI dump and demands interpretation", () => {
  const p = buildReportPrompt("morning", "en").toLowerCase();
  assert.ok(p.includes("not a dashboard"), "must say it is not a dashboard");
  assert.ok(p.includes("kpi dump"), "must call out the KPI dump as a failure");
  assert.ok(p.includes("what changed"), "must orient around what changed");
});

test("the prompt enforces the verbatim number whitelist", () => {
  const p = buildReportPrompt("morning", "fr").toLowerCase();
  assert.ok(p.includes("verbatim"), "numbers may only be quoted verbatim");
  assert.ok(/never invent|never compute your own percentage/.test(p), "must forbid inventing numbers/percentages");
  assert.ok(p.includes("deltapct"), "percentages must come from comparison.deltaPct");
});

test("the prompt separates fact from inference and caps actions at three", () => {
  const p = buildReportPrompt("evening", "en").toLowerCase();
  assert.ok(p.includes("separate fact from inference"), "must separate fact from inference");
  assert.ok(p.includes("at most 3"), "must cap recommended actions at three");
  assert.ok(p.includes("omit any section"), "must omit empty sections");
});

test("the prompt scopes the AI to the briefing fields", () => {
  const p = buildReportPrompt("weekly", "en");
  for (const field of ["executiveSummary", "whatChanged", "anomalies", "likelyExplanation", "recommendedActions", "keepUnchanged", "watchList"]) {
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
  assert.ok(p.includes("intelligence brief"), "hard rules remain");
  assert.ok(p.includes("Keep it under 5 lines."), "extra guidance appended");
});

test("the structured schema requires exactly the seven briefing fields", () => {
  assert.equal(REPORT_NARRATIVE_SCHEMA.type, "object");
  assert.deepEqual(REPORT_NARRATIVE_SCHEMA.required, [
    "executiveSummary",
    "whatChanged",
    "anomalies",
    "likelyExplanation",
    "recommendedActions",
    "keepUnchanged",
    "watchList",
  ]);
  assert.equal(REPORT_NARRATIVE_SCHEMA.additionalProperties, false);
});

test("coercion uses the model prose when present, else the deterministic fallback", () => {
  const fallback: ReportNarrative = {
    executiveSummary: "fallback",
    whatChanged: [],
    anomalies: [],
    likelyExplanation: "",
    recommendedActions: [],
    keepUnchanged: "",
    watchList: "",
  };
  const good = coerceReportNarrative(
    '{"executiveSummary":"All calm.","whatChanged":["x","y"],"anomalies":[],"likelyExplanation":"maybe","recommendedActions":["a","b","c","d"],"keepUnchanged":"","watchList":"watch z"}',
    fallback,
  );
  assert.equal(good.executiveSummary, "All calm.");
  assert.deepEqual(good.whatChanged, ["x", "y"]);
  assert.equal(good.recommendedActions.length, 3, "actions capped at three");
  assert.equal(good.watchList, "watch z");

  // No parseable summary → the deterministic fallback is returned unchanged.
  assert.equal(coerceReportNarrative("not json", fallback), fallback);
  assert.equal(coerceReportNarrative('{"executiveSummary":""}', fallback), fallback);
});
