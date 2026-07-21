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

test("the embed prints deterministic figures, not model-invented ones", () => {
  const payload = buildReportPayload(metrics(), narrative);
  const embed = payload.embeds![0];
  const flat = JSON.stringify(embed);
  assert.match(embed.title!, /Morning Brief/);
  assert.match(flat, /1,234 MAD/); // revenue from figures
  assert.match(flat, /Netflix 1 mois/); // top product from figures
  assert.equal(embed.description, "Solid morning; orders are flowing.");
});

test("no embed field value is ever empty (Discord rejects empty fields)", () => {
  const payload = buildReportPayload(metrics({ paymentMethods: [], topProducts: [], operationalAlerts: [] }), {
    summary: "",
    recommendations: [],
    trends: "",
    topPriorities: [],
  });
  for (const field of payload.embeds![0].fields ?? []) {
    assert.ok(field.value.trim().length > 0, `field "${field.name}" must not be empty`);
  }
});

test("missing figures render as n/a, never invented", () => {
  const payload = buildReportPayload(
    metrics({ revenueMad: null, ordersTotal: null, ordersDelivered: null, ordersWaiting: null }),
    narrative,
  );
  const flat = JSON.stringify(payload.embeds![0]);
  assert.match(flat, /n\/a/);
});

test("unavailable tools are surfaced, not hidden", () => {
  const payload = buildReportPayload(metrics({}, { unavailable: ["getPaymentSummary"] }), narrative);
  const flat = JSON.stringify(payload.embeds![0]);
  assert.match(flat, /Unavailable data/);
  assert.match(flat, /getPaymentSummary/);
});

test("the markdown rendering carries the same figures for previews/replies", () => {
  const text = buildReportText(metrics(), narrative);
  assert.match(text, /Ghost\.ma Morning Brief/);
  assert.match(text, /1,234 MAD/);
  assert.match(text, /Clear the waiting orders\./);
});

test("operational alerts are listed as bullets", () => {
  const payload = buildReportPayload(metrics({ operationalAlerts: ["Job \"x\" is failing (2 consecutive)"] }), narrative);
  const alerts = payload.embeds![0].fields!.find((f) => f.name.includes("Alerts"));
  assert.match(alerts!.value, /failing/);
});
