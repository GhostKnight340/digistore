// Daily Reports — Discord formatting (spec: report format, missing data). Pure.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildReportPayload, buildReportText } from "../../src/lib/ai-ops/reports/format";
import type { ReportMetrics } from "../../src/lib/ai-ops/reports/metrics";
import type { ReportNarrative } from "../../src/lib/ai-ops/reports/prompt";

const narrative: ReportNarrative = {
  summary: "Solid morning; orders are flowing.",
  recommendations: ["Confirm the two pending payments."],
  trends: "Revenue is stable week over week.",
  topPriorities: ["Clear the waiting orders."],
};

function metrics(overrides: Partial<ReportMetrics["figures"]> = {}, extra: Partial<ReportMetrics> = {}): ReportMetrics {
  return {
    type: "morning",
    windowLabel: "yesterday",
    grounding: {},
    unavailable: [],
    figures: {
      revenueMad: 1234,
      ordersTotal: 10,
      ordersDelivered: 8,
      ordersWaiting: 2,
      pendingPaymentConfirmations: 1,
      paymentMethods: [{ method: "CIH BANK", count: 5, totalMad: 900 }],
      paymentByStatus: [{ status: "delivered", count: 8 }],
      topProducts: [{ name: "Netflix 1 mois", unitsSold: 6 }],
      fulfillmentByStatus: [{ status: "delivered", count: 8 }],
      operationalAlerts: [],
      ...overrides,
    },
    ...extra,
  };
}

test("the single-list embed prints deterministic figures + an Actions list", () => {
  const embed = buildReportPayload(metrics(), narrative).embeds![0];
  const desc = embed.description!;
  assert.match(embed.title!, /Morning Brief/);
  assert.match(desc, /1,234 MAD/); // revenue from figures
  assert.match(desc, /Netflix 1 mois/); // top product from figures
  assert.match(desc, /\*\*Actions\*\*/); // merged recommendations + priorities
  assert.match(desc, /Clear the waiting orders\./);
  assert.equal(embed.fields, undefined); // single list, no separate fields
});

test("the description is never empty even when everything is blank", () => {
  const embed = buildReportPayload(metrics({ paymentMethods: [], topProducts: [], operationalAlerts: [] }), {
    summary: "",
    recommendations: [],
    trends: "",
    topPriorities: [],
  }).embeds![0];
  assert.ok((embed.description ?? "").trim().length > 0);
  assert.match(embed.description!, /Nothing urgent/); // Actions fallback
});

test("missing figures render as n/a, never invented", () => {
  const embed = buildReportPayload(
    metrics({ revenueMad: null, ordersTotal: null, ordersDelivered: null, ordersWaiting: null }),
    narrative,
  ).embeds![0];
  assert.match(embed.description!, /n\/a/);
});

test("unavailable tools are surfaced, not hidden", () => {
  const embed = buildReportPayload(metrics({}, { unavailable: ["getPaymentSummary"] }), narrative).embeds![0];
  assert.match(embed.description!, /Unavailable/);
  assert.match(embed.description!, /getPaymentSummary/);
});

test("the markdown rendering carries the same figures for previews/replies", () => {
  const text = buildReportText(metrics(), narrative);
  assert.match(text, /Ghost\.ma Morning Brief/);
  assert.match(text, /1,234 MAD/);
  assert.match(text, /Clear the waiting orders\./);
});

test("operational alerts are listed as bullets", () => {
  const embed = buildReportPayload(metrics({ operationalAlerts: ['Job "x" is failing (2 consecutive)'] }), narrative).embeds![0];
  assert.match(embed.description!, /failing/);
});
