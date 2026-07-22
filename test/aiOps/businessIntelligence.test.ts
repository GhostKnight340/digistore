// Business Intelligence — financial brief format + prompt + registry guards.
// Pure/source-level (the body imports server-only code). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildBiPayload, buildBiText } from "../../src/lib/ai-ops/bi/format";
import { buildBiPrompt } from "../../src/lib/ai-ops/bi/prompt";
import type { BiMetrics } from "../../src/lib/ai-ops/bi/metrics";
import type { AiNarrative } from "../../src/lib/ai-ops/narrative";
import { TOOL_NAMES, MODULE_DEFINITIONS, CHANNEL_PURPOSES } from "../../src/lib/ai-ops/types";
import { TOOL_VALIDATORS } from "../../src/lib/ai-ops/tools/schemas";

const narrative: AiNarrative = {
  summary: "Profitability held steady; Steam carries the margin while gift cards drag it down.",
  recommendations: ["Renegotiate the gift-card supplier cost."],
  trends: "Margin is flat but revenue concentration is rising.",
  topPriorities: ["Diversify away from the top category."],
};

function metrics(overrides: Partial<BiMetrics["figures"]> = {}, extra: Partial<BiMetrics> = {}): BiMetrics {
  return {
    windowLabel: "the last 7 days",
    baselineLabel: "the previous 7 days",
    grounding: {},
    unavailable: [],
    figures: {
      revenueMad: 12000,
      coveredRevenueMad: 9000,
      costMad: 6300,
      grossProfitMad: 2700,
      marginPct: 30,
      costCoveragePct: 75,
      unconvertedCostRecords: 2,
      revenueDeltaPct: "+12%",
      marginDeltaPp: "-2.5pp",
      ordersDelivered: 40,
      topCategories: [
        { category: "Steam", revenueMad: 8000, costMad: 5000, grossProfitMad: 3000, marginPct: 37.5, unitsSold: 20 },
        { category: "PlayStation", revenueMad: 4000, costMad: 1300, grossProfitMad: 2700, marginPct: null, unitsSold: 10 },
      ],
      lowMarginCategories: [{ category: "Gift cards", revenueMad: 1000, costMad: 950, grossProfitMad: 50, marginPct: 5, unitsSold: 5 }],
      topCategorySharePct: 66.7,
      paymentMethods: [{ method: "CIH BANK", count: 12, totalMad: 8000 }],
      fulfillmentFailed: 1,
      ...overrides,
    },
    ...extra,
  };
}

// ── Format ───────────────────────────────────────────────────────────────────

test("the embed leads with the summary and prints the financial figures", () => {
  const embed = buildBiPayload(metrics(), narrative).embeds![0];
  const desc = embed.description!;
  assert.match(embed.title!, /Business Intelligence/);
  assert.match(desc, /Profitability held steady/); // executive summary
  assert.match(desc, /Revenu:.*12,000/); // revenue from figures
  assert.match(desc, /\+12%/); // revenue trend delta
  assert.match(desc, /30%/); // margin
  assert.match(desc, /-2\.5pp/); // margin trend
  assert.match(desc, /Steam:.*marge 37\.5%/); // category margin
});

test("a partial cost coverage shows the margin caveat, not a false-complete margin", () => {
  const desc = buildBiPayload(metrics(), narrative).embeds![0].description!;
  assert.match(desc, /estimée sur 75% du revenu/); // coverage caveat surfaced
});

test("high concentration flips the colour and is flagged", () => {
  const embed = buildBiPayload(metrics({ topCategorySharePct: 82 }), narrative).embeds![0];
  assert.match(embed.description!, /82% du revenu.*concentration élevée/);
  assert.equal(embed.color, 0xe67e22); // warn colour
});

test("a null category margin is shown as n/a, never fabricated", () => {
  const desc = buildBiPayload(metrics(), narrative).embeds![0].description!;
  assert.match(desc, /PlayStation:.*marge n\/a/);
});

test("empty week renders without crashing and states no sales", () => {
  const embed = buildBiPayload(
    metrics({ revenueMad: 0, topCategories: [], lowMarginCategories: [], topCategorySharePct: null, paymentMethods: [], marginPct: null }),
    { summary: "", recommendations: [], trends: "", topPriorities: [] },
  ).embeds![0];
  assert.ok((embed.description ?? "").trim().length > 0);
  assert.match(embed.description!, /Aucune vente livrée/);
});

test("unavailable tools are surfaced", () => {
  const desc = buildBiPayload(metrics({}, { unavailable: ["getMarginSummary"] }), narrative).embeds![0].description!;
  assert.match(desc, /Indisponible.*getMarginSummary/);
});

test("the markdown rendering carries the same brief", () => {
  const text = buildBiText(metrics(), narrative);
  assert.match(text, /Ghost\.ma Business Intelligence/);
  assert.match(text, /30%/);
});

// ── Prompt ───────────────────────────────────────────────────────────────────

test("the prompt frames BI as the weekly FINANCIAL review, distinct from operations", () => {
  const p = buildBiPrompt("en").toLowerCase();
  assert.ok(p.includes("financial"));
  assert.ok(p.includes("margin"));
  assert.ok(p.includes("not") && p.includes("operational"), "distinguishes from the operational brief");
});

test("the prompt forbids inventing numbers and enforces the cost-coverage caveat", () => {
  const p = buildBiPrompt("en").toLowerCase();
  assert.ok(/never invent/.test(p));
  assert.ok(p.includes("costcoveragepct"), "must reference the coverage caveat");
  assert.ok(p.includes("never compute your own"), "deltas must be quoted, not computed");
});

test("the prompt writes prose in the configured language + appends operator guidance", () => {
  assert.match(buildBiPrompt("fr"), /French/);
  assert.match(buildBiPrompt("ar"), /Arabic/);
  const withExtra = buildBiPrompt("en", "Keep it under 5 lines.");
  assert.ok(withExtra.includes("Keep it under 5 lines."));
});

// ── Registry consistency ─────────────────────────────────────────────────────

test("getMarginSummary is a registered tool with a validator, granted to BI only where used", () => {
  assert.ok((TOOL_NAMES as readonly string[]).includes("getMarginSummary"));
  assert.ok(typeof TOOL_VALIDATORS.getMarginSummary === "function");
  const bi = MODULE_DEFINITIONS.business_intelligence;
  assert.ok(bi.defaultTools.includes("getMarginSummary"));
  // BI's grants must all be real tools (no wildcard, least privilege).
  for (const t of bi.defaultTools) assert.ok((TOOL_NAMES as readonly string[]).includes(t), `${t} is a real tool`);
});

test("business_intelligence has a Discord channel purpose and is a scheduled module", () => {
  assert.ok((CHANNEL_PURPOSES as readonly string[]).includes("business_intelligence"));
  assert.equal(MODULE_DEFINITIONS.business_intelligence.scheduled, true);
});

// ── Source-level security guards (the body imports server-only code) ──────────

test("the BI metric layer reads via the safe tool layer, never Prisma directly", () => {
  const src = readFileSync("src/lib/ai-ops/bi/metrics.ts", "utf8");
  assert.ok(!/@\/lib\/db\/prisma/.test(src), "must not import the prisma client");
  assert.ok(/callTool\(/.test(src), "must gather via callTool");
});

test("the BI body is registered in the scheduler's module-body registry", () => {
  const src = readFileSync("src/lib/ai-ops/moduleBodies.ts", "utf8");
  assert.ok(/business_intelligence:\s*businessIntelligenceBody/.test(src));
});
