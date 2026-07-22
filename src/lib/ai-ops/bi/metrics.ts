/**
 * Business Intelligence — deterministic weekly financial metrics.
 *
 * The ONLY data source is the safe tool layer (`callTool`), so every permission,
 * rate-limit, redaction and logging guarantee applies — this NEVER touches
 * Prisma. It gathers the current week and the prior week and computes the
 * financial picture BI is for: gross margins (revenue vs supplier cost, from
 * getMarginSummary), week-over-week revenue & margin trend, category
 * profitability, revenue-concentration risk, and payment mix.
 *
 * Margins are honest by construction — getMarginSummary reports a
 * `costCoveragePct`, and a category with no captured cost carries a null margin
 * that is surfaced, never a fabricated number.
 */

import "server-only";

import { callTool } from "../tools/service";
import { baselineWindow } from "../reports/comparison";
import { BUSINESS_INTELLIGENCE_MODULE } from "./module";
import type { ToolName } from "../types";

export interface CategoryMargin {
  category: string;
  revenueMad: number;
  costMad: number;
  grossProfitMad: number;
  marginPct: number | null;
  unitsSold: number;
}
export interface MethodLine {
  method: string;
  count: number;
  totalMad: number;
}

export interface BiFigures {
  revenueMad: number | null;
  coveredRevenueMad: number | null;
  costMad: number | null;
  grossProfitMad: number | null;
  marginPct: number | null;
  /** Share of revenue with a known, convertible supplier cost (margin caveat). */
  costCoveragePct: number | null;
  /** Cost records that could not be converted to MAD (missing FX rate). */
  unconvertedCostRecords: number;
  /** Week-over-week revenue change, pre-formatted (e.g. "+12%"), or null. */
  revenueDeltaPct: string | null;
  /** Week-over-week margin change in percentage points (e.g. "+3.2pp"), or null. */
  marginDeltaPp: string | null;
  ordersDelivered: number | null;
  /** Categories by revenue, each with its own margin. */
  topCategories: CategoryMargin[];
  /** Lowest-margin categories that still carry meaningful revenue (profit risk). */
  lowMarginCategories: CategoryMargin[];
  /** Top category's share of total revenue (concentration risk), 0-100. */
  topCategorySharePct: number | null;
  paymentMethods: MethodLine[];
  fulfillmentFailed: number | null;
}

export interface BiMetrics {
  windowLabel: string;
  baselineLabel: string;
  figures: BiFigures;
  grounding: Record<string, unknown>;
  unavailable: string[];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function pct(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const r = Math.round(((current - previous) / previous) * 100);
  return `${r > 0 ? "+" : ""}${r}%`;
}
function pp(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const d = Math.round((current - previous) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}pp`;
}

function categoriesFrom(margin: Record<string, unknown> | null): CategoryMargin[] {
  const rows = margin && Array.isArray(margin.byCategory) ? margin.byCategory : [];
  return rows
    .map((r) => {
      const o = asRecord(r);
      if (!o) return null;
      return {
        category: String(o.category ?? "—"),
        revenueMad: num(o.revenueMad) ?? 0,
        costMad: num(o.costMad) ?? 0,
        grossProfitMad: num(o.grossProfitMad) ?? 0,
        marginPct: num(o.marginPct),
        unitsSold: num(o.unitsSold) ?? 0,
      };
    })
    .filter((c): c is CategoryMargin => c !== null);
}

/**
 * Gathers BI's weekly financial metrics through the safe tool layer. The current
 * window is the last 7 days; the prior 7-day block powers the trend deltas. A
 * failed tool is recorded as unavailable rather than aborting.
 */
export async function gatherBiMetrics(executionId: string | null): Promise<BiMetrics> {
  const base = baselineWindow("weekly", new Date());
  const current = { range: { preset: "last_7_days" as const } };
  const prior = { range: base.range };
  const grounding: Record<string, unknown> = {};
  const unavailable: string[] = [];

  async function read(tool: ToolName, input: unknown): Promise<Record<string, unknown> | null> {
    const result = await callTool({ module: BUSINESS_INTELLIGENCE_MODULE, tool, input, executionId });
    if (result.ok) {
      grounding[`${tool}:${JSON.stringify(input) === JSON.stringify(current) ? "current" : "prior"}`] = result.data;
      return asRecord(result.data);
    }
    unavailable.push(tool);
    return null;
  }

  const [salesNow, salesPrev, marginNow, marginPrev, payments, fulfillment] = await Promise.all([
    read("getSalesSummary", current),
    read("getSalesSummary", prior),
    read("getMarginSummary", current),
    read("getMarginSummary", prior),
    read("getPaymentSummary", current),
    read("getFulfillmentPerformance", current),
  ]);

  const totalsNow = marginNow && asRecord(marginNow.totals);
  const totalsPrev = marginPrev && asRecord(marginPrev.totals);
  const revenueMad = totalsNow ? num(totalsNow.revenueMad) : salesNow ? num(salesNow.revenueMad) : null;
  const marginPct = totalsNow ? num(totalsNow.marginPct) : null;

  // Trend deltas vs the prior week.
  const revPrev = totalsPrev ? num(totalsPrev.revenueMad) : salesPrev ? num(salesPrev.revenueMad) : null;
  const revenueDeltaPct = revenueMad != null && revPrev != null ? pct(revenueMad, revPrev) : null;
  const marginDeltaPp = pp(marginPct, totalsPrev ? num(totalsPrev.marginPct) : null);

  const categories = categoriesFrom(marginNow);
  const withRevenue = categories.filter((c) => c.revenueMad > 0);
  const totalCatRevenue = withRevenue.reduce((s, c) => s + c.revenueMad, 0);
  const topCategorySharePct =
    totalCatRevenue > 0 && withRevenue.length ? Math.round((withRevenue[0].revenueMad / totalCatRevenue) * 1000) / 10 : null;
  // Lowest-margin categories that still matter (known margin + non-trivial revenue).
  const lowMarginCategories = [...withRevenue]
    .filter((c) => c.marginPct != null)
    .sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0))
    .slice(0, 3);

  const byMethod = payments && Array.isArray(payments.byMethod) ? payments.byMethod : [];
  const paymentMethods: MethodLine[] = byMethod
    .map((m) => {
      const o = asRecord(m);
      return o ? { method: String(o.paymentMethod ?? "—"), count: num(o.count) ?? 0, totalMad: num(o.totalMad) ?? 0 } : null;
    })
    .filter((m): m is MethodLine => m !== null)
    .sort((a, b) => b.totalMad - a.totalMad)
    .slice(0, 5);

  const figures: BiFigures = {
    revenueMad,
    coveredRevenueMad: totalsNow ? num(totalsNow.coveredRevenueMad) : null,
    costMad: totalsNow ? num(totalsNow.costMad) : null,
    grossProfitMad: totalsNow ? num(totalsNow.grossProfitMad) : null,
    marginPct,
    costCoveragePct: marginNow ? num(marginNow.costCoveragePct) : null,
    unconvertedCostRecords: (marginNow ? num(marginNow.unconvertedCostRecords) : 0) ?? 0,
    revenueDeltaPct,
    marginDeltaPp,
    ordersDelivered: salesNow ? num(salesNow.ordersDelivered) : null,
    topCategories: withRevenue.slice(0, 6),
    lowMarginCategories,
    topCategorySharePct,
    paymentMethods,
    fulfillmentFailed: fulfillment ? num(fulfillment.failed) : null,
  };

  return { windowLabel: "the last 7 days", baselineLabel: base.label, figures, grounding, unavailable };
}
