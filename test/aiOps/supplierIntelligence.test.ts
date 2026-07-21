// AI Operations — Supplier Intelligence: formatting, prompt, and module security
// guards (spec: Supplier Intelligence). Pure + source-level. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildSupplierPayload, buildSupplierText } from "../../src/lib/ai-ops/supplier/format";
import { buildSupplierPrompt } from "../../src/lib/ai-ops/supplier/prompt";
import type { SupplierMetrics } from "../../src/lib/ai-ops/supplier/metrics";
import type { AiNarrative } from "../../src/lib/ai-ops/narrative";
import { DEFAULT_TOOL_GRANTS } from "../../src/lib/ai-ops/types";

const narrative: AiNarrative = {
  summary: "Reloadly is healthy; FazerCards subscription is inactive.",
  recommendations: ["Renew the FazerCards subscription."],
  trends: "Stable latency week over week.",
  topPriorities: ["Restore FazerCards."],
};

function metrics(over: Partial<SupplierMetrics["figures"]> = {}, extra: Partial<SupplierMetrics> = {}): SupplierMetrics {
  return {
    windowLabel: "the last 7 days",
    unavailable: [],
    figures: {
      suppliers: [
        { id: "reloadly", enabled: true, subscriptionActive: null, lastSuccessAt: "2026-07-21T10:00:00.000Z", lastFailureAt: null, lastLatencyMs: 320, status: "healthy" },
        { id: "fazercards", enabled: true, subscriptionActive: false, lastSuccessAt: null, lastFailureAt: "2026-07-21T09:00:00.000Z", lastLatencyMs: 8000, status: "degraded" },
      ],
      costs: [{ supplier: "reloadly", deliveredCount: 12, avgCost: 4.5, totalCost: 54 }],
      fulfillment: { total: 20, failed: 2, byStatus: [{ status: "delivered", count: 18 }, { status: "failed", count: 2 }] },
      alerts: ["fazercards subscription is INACTIVE", "2 failed fulfillment(s) in the last 7 days"],
      ...over,
    },
    ...extra,
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

test("the embed prints deterministic figures with health status, not model-invented ones", () => {
  const embed = buildSupplierPayload(metrics(), narrative).embeds![0];
  const flat = JSON.stringify(embed);
  assert.match(embed.title!, /Supplier Intelligence/);
  assert.match(flat, /reloadly/);
  assert.match(flat, /fazercards/);
  assert.match(flat, /🟢|🟡|🔴/); // health status emoji
  assert.match(flat, /54\.00/); // total cost from figures
});

test("the single-list description is never empty even when everything is blank", () => {
  const embed = buildSupplierPayload(
    metrics({ suppliers: [], costs: [], alerts: [], fulfillment: { total: null, failed: null, byStatus: [] } }),
    { summary: "", recommendations: [], trends: "", topPriorities: [] },
  ).embeds![0];
  assert.ok((embed.description ?? "").trim().length > 0);
  assert.match(embed.description!, /\*\*Status\*\*/);
  assert.match(embed.description!, /Nothing needed/); // Actions fallback
  assert.equal(embed.fields, undefined); // single list, no separate fields
});

test("missing costs/fulfillment render as n/a, never invented", () => {
  const desc = buildSupplierPayload(
    metrics({ costs: [], fulfillment: { total: null, failed: null, byStatus: [] } }),
    narrative,
  ).embeds![0].description!;
  assert.match(desc, /n\/a|None this period/);
});

test("unavailable tools are surfaced, not hidden", () => {
  const desc = buildSupplierPayload(metrics({}, { unavailable: ["getSupplierApiHealth"] }), narrative).embeds![0].description!;
  assert.match(desc, /Unavailable/);
  assert.match(desc, /getSupplierApiHealth/);
});

test("the markdown rendering carries the same health + alerts for previews", () => {
  const text = buildSupplierText(metrics(), narrative);
  assert.match(text, /Supplier Intelligence/);
  assert.match(text, /fazercards/);
  assert.match(text, /INACTIVE/);
  assert.match(text, /Restore FazerCards\./);
});

// ─── Prompt ──────────────────────────────────────────────────────────────────

test("the prompt forbids inventing numbers and scopes the AI to prose", () => {
  const p = buildSupplierPrompt("fr");
  assert.match(p, /NEVER invent/);
  for (const field of ["summary", "recommendations", "trends", "topPriorities"]) {
    assert.ok(p.includes(field), `prompt should describe the ${field} field`);
  }
  assert.match(p, /French/);
  assert.match(p, /credential|balance/i);
});

// ─── Registry + security guards ──────────────────────────────────────────────

test("supplier tools are all granted to the supplier_intelligence module", () => {
  const granted = new Set<string>(DEFAULT_TOOL_GRANTS.supplier_intelligence);
  for (const tool of ["getSupplierApiHealth", "getSupplierProductCosts", "getFulfillmentPerformance"]) {
    assert.ok(granted.has(tool), `${tool} must be a supplier_intelligence grant`);
  }
});

const MODULE_SRC = readFileSync("src/lib/ai-ops/modules/supplierIntelligence.ts", "utf8");
const METRICS_SRC = readFileSync("src/lib/ai-ops/supplier/metrics.ts", "utf8");

test("the module never imports Prisma directly — it reads via the safe tool layer", () => {
  for (const src of [MODULE_SRC, METRICS_SRC]) {
    assert.ok(!/@\/lib\/db\/prisma/.test(src), "must not import the prisma client");
    assert.ok(!/from ["']@prisma\/client["']/.test(src), "must not import prisma client pkg");
  }
  assert.ok(/callTool\(/.test(METRICS_SRC), "metrics must read data through callTool");
  assert.ok(/runModule\(/.test(MODULE_SRC), "must execute via runModule");
  assert.ok(!/discord\.js/.test(MODULE_SRC), "app module must not pull in discord.js");
});

test("supplier_intelligence is wired into the base scheduler's body registry", () => {
  const src = readFileSync("src/lib/ai-ops/moduleBodies.ts", "utf8");
  assert.ok(/supplier_intelligence:\s*supplierBody/.test(src), "registry must map supplier_intelligence to its body");
});

test("the base dispatcher gates scheduled modules by real cron time", () => {
  const src = readFileSync("src/lib/ai-ops/dispatch.ts", "utf8");
  assert.ok(/cronMatchesHour/.test(src), "dispatch must gate on the module's cron time");
  assert.ok(/bodyForModule/.test(src), "dispatch must run the module's real body");
});
