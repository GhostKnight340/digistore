// Daily Reports — Discord formatting (spec: intelligence brief, omit empty
// sections, never blank). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReportPayload, buildReportText } from "../../src/lib/ai-ops/reports/format";
import type { ReportMetrics } from "../../src/lib/ai-ops/reports/metrics";
import type { ReportNarrative } from "../../src/lib/ai-ops/reports/prompt";
import { computeComparison } from "../../src/lib/ai-ops/reports/comparison";

const narrative: ReportNarrative = {
  executiveSummary: "Steam demand held steady overnight; two payments remain unreviewed.",
  whatChanged: ["PlayStation demand rose versus the day before."],
  anomalies: ["Two paid orders are still waiting on manual review."],
  likelyExplanation: "This likely indicates an internal review delay rather than a supplier problem.",
  recommendedActions: ["Clear the delayed payment reviews first.", "Confirm PlayStation demand continues today."],
  keepUnchanged: "",
  watchList: "Payment-review time and PlayStation conversion.",
};

const emptyNarrative: ReportNarrative = {
  executiveSummary: "",
  whatChanged: [],
  anomalies: [],
  likelyExplanation: "",
  recommendedActions: [],
  keepUnchanged: "",
  watchList: "",
};

function metrics(type: ReportMetrics["type"] = "morning", extra: Partial<ReportMetrics> = {}): ReportMetrics {
  const comparison = computeComparison(
    { revenueMad: 1800, ordersTotal: 8, ordersDelivered: 7, paymentMethods: [], topProducts: [], fulfillmentFailed: 0 },
    { revenueMad: 2000, ordersTotal: 9, ordersDelivered: 9, paymentMethods: [], topProducts: [], fulfillmentFailed: 0 },
    { baselineLabel: "the day before", currentIsPartial: false, available: true },
  );
  return {
    type,
    windowLabel: "yesterday",
    grounding: {},
    unavailable: [],
    comparison,
    figures: {
      revenueMad: 1800,
      ordersTotal: 8,
      ordersDelivered: 7,
      ordersWaiting: 2,
      pendingPaymentConfirmations: 1,
      paymentMethods: [],
      paymentByStatus: [],
      topProducts: [],
      fulfillmentByStatus: [],
      operationalAlerts: [],
    },
    ...extra,
  };
}

test("the brief renders the summary + only the sections that carry insight", () => {
  const embed = buildReportPayload(metrics(), narrative).embeds![0];
  const desc = embed.description!;
  assert.match(embed.title!, /Morning Brief/);
  assert.match(desc, /Steam demand held steady/); // executive summary paragraph
  assert.match(desc, /\*\*What changed\*\*/);
  assert.match(desc, /\*\*Needs attention\*\*/);
  assert.match(desc, /\*\*Likely explanation\*\*/);
  assert.match(desc, /1\. Clear the delayed payment reviews first\./); // numbered actions
  assert.match(desc, /\*\*Watch today\*\*/);
  assert.equal(embed.fields, undefined); // single briefing embed, no KPI fields
});

test("it does NOT dump KPIs — raw figures are absent unless the model quoted them", () => {
  const desc = buildReportPayload(metrics(), narrative).embeds![0].description!;
  assert.doesNotMatch(desc, /\*\*Revenue\*\*|\*\*Top products\*\*|\*\*Payment methods\*\*/);
  assert.doesNotMatch(desc, /1,800 MAD/); // narrative didn't mention it → not printed
});

test("morning has no keep-unchanged section even if content is present", () => {
  const desc = buildReportPayload(metrics("morning"), { ...narrative, keepUnchanged: "leave routing alone" }).embeds![0]
    .description!;
  assert.doesNotMatch(desc, /What not to change|leave routing alone/); // daily briefs omit it
});

test("weekly/monthly use their own section labels incl. keep-unchanged", () => {
  const weekly = buildReportPayload(metrics("weekly"), {
    ...narrative,
    keepUnchanged: "Current supplier routing is healthy.",
  }).embeds![0].description!;
  assert.match(weekly, /\*\*Key developments\*\*/);
  assert.match(weekly, /\*\*Decisions to consider\*\*/);
  assert.match(weekly, /\*\*What not to change\*\*/);
  assert.match(weekly, /\*\*Next week's watch list\*\*/);
});

test("a fully empty narrative shows the honest quiet line, never a blank embed", () => {
  const embed = buildReportPayload(metrics(), emptyNarrative).embeds![0];
  assert.ok((embed.description ?? "").trim().length > 0);
  assert.match(embed.description!, /No significant operational changes were detected/);
});

test("unavailable tools are surfaced, not hidden", () => {
  const desc = buildReportPayload(metrics("morning", { unavailable: ["getPaymentSummary"] }), narrative).embeds![0]
    .description!;
  assert.match(desc, /unavailable/i);
  assert.match(desc, /getPaymentSummary/);
});

test("the markdown rendering carries the same brief for previews/replies", () => {
  const text = buildReportText(metrics(), narrative);
  assert.match(text, /Ghost\.ma Morning Brief/);
  assert.match(text, /Steam demand held steady/);
  assert.match(text, /Clear the delayed payment reviews first\./);
});
