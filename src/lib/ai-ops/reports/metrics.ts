/**
 * Daily Reports — deterministic metric gathering (spec: "Everything except the
 * summary/recommendations must be deterministic calculations").
 *
 * This is the ONLY data source for a report and it NEVER touches Prisma: every
 * figure comes from the safe tool layer (`callTool`), so all the permission,
 * rate-limit, redaction, and logging guarantees apply. A tool that is denied or
 * fails is recorded as unavailable — its figures stay null and are surfaced as
 * "could not be retrieved" rather than invented.
 *
 * The output has two parts:
 *   - `figures`  — computed numbers the formatter renders deterministically.
 *   - `grounding`— the raw (already-redacted) tool snapshot handed to the model
 *                  as read-only grounding for the narrative, exactly like the
 *                  Discord assistant does. The model may only describe these.
 */

import "server-only";

import { callTool } from "../tools/service";
import { DAILY_REPORTS_MODULE } from "./module";
import { reportDefinition, type ReportType } from "./reportTypes";
import type { ToolName } from "../types";

interface ToolInputs {
  [tool: string]: unknown;
}

/** Safe, clamped input per tool for a report window. */
function toolInputs(type: ReportType): ToolInputs {
  const { window } = reportDefinition(type);
  const period = { periodDays: window.periodDays, untilDays: window.untilDays };
  return {
    getSalesSummary: period,
    getPaymentSummary: period,
    getFulfillmentPerformance: period,
    getTopSellingProducts: { ...period, limit: 10 },
    getPendingOrders: { limit: 20 },
    getRecentOperationalEvents: { limit: 15 },
  };
}

export interface ProductLine {
  name: string;
  unitsSold: number;
}
export interface MethodLine {
  method: string;
  count: number;
  totalMad: number;
}
export interface StatusLine {
  status: string;
  count: number;
}

/** Deterministic, ready-to-render figures. `null` = the source was unavailable. */
export interface ReportFigures {
  revenueMad: number | null;
  ordersTotal: number | null;
  ordersDelivered: number | null;
  ordersWaiting: number | null;
  pendingPaymentConfirmations: number | null;
  paymentMethods: MethodLine[];
  paymentByStatus: StatusLine[];
  topProducts: ProductLine[];
  fulfillmentByStatus: StatusLine[];
  operationalAlerts: string[];
}

export interface ReportMetrics {
  type: ReportType;
  windowLabel: string;
  figures: ReportFigures;
  /** Raw, redacted tool snapshot for the model's grounding. */
  grounding: Record<string, unknown>;
  /** Tools that could not be read (denied / rate-limited / errored). */
  unavailable: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Counts pending orders whose status is a submitted-but-unconfirmed payment. */
function countPendingPayment(pending: Record<string, unknown> | null): number | null {
  if (!pending) return null;
  const orders = Array.isArray(pending.orders) ? pending.orders : [];
  return orders.filter((o) => asRecord(o)?.status === "payment_submitted").length;
}

/** Builds the human alert lines from operational events (failures only). */
function operationalAlerts(events: Record<string, unknown> | null): string[] {
  if (!events) return [];
  const alerts: string[] = [];
  const supplierLogs = Array.isArray(events.supplierLogs) ? events.supplierLogs : [];
  const failedCalls = supplierLogs.filter((l) => asRecord(l)?.ok === false).length;
  if (failedCalls > 0) alerts.push(`${failedCalls} failed supplier API call${failedCalls === 1 ? "" : "s"} recently`);
  const jobRuns = Array.isArray(events.jobRuns) ? events.jobRuns : [];
  for (const run of jobRuns) {
    const r = asRecord(run);
    if (!r) continue;
    const failures = num(r.consecutiveFailures) ?? 0;
    if (r.status === "failure" || failures > 0) {
      alerts.push(`Job "${String(r.job)}" is failing (${failures} consecutive)`);
    }
  }
  return alerts.slice(0, 8);
}

/**
 * Gathers a report's metrics through the safe tool layer. `executionId`
 * correlates every tool call to the run. Only the report's declared tools are
 * pulled; a failed tool is recorded as unavailable rather than aborting.
 */
export async function gatherReportMetrics(
  type: ReportType,
  executionId: string | null,
): Promise<ReportMetrics> {
  const def = reportDefinition(type);
  const inputs = toolInputs(type);
  const grounding: Record<string, unknown> = {};
  const unavailable: string[] = [];
  const data: Partial<Record<ToolName, Record<string, unknown> | null>> = {};

  for (const tool of def.tools) {
    const result = await callTool({
      module: DAILY_REPORTS_MODULE,
      tool,
      input: inputs[tool] ?? {},
      executionId,
    });
    if (result.ok) {
      grounding[tool] = result.data;
      data[tool] = asRecord(result.data);
    } else {
      grounding[tool] = { unavailable: true, reason: result.status };
      data[tool] = null;
      unavailable.push(tool);
    }
  }

  const sales = data.getSalesSummary ?? null;
  const payments = data.getPaymentSummary ?? null;
  const pending = data.getPendingOrders ?? null;
  const products = data.getTopSellingProducts ?? null;
  const fulfillment = data.getFulfillmentPerformance ?? null;
  const events = data.getRecentOperationalEvents ?? null;

  const byMethod = payments && Array.isArray(payments.byMethod) ? payments.byMethod : [];
  const byStatus = payments && Array.isArray(payments.byStatus) ? payments.byStatus : [];
  const productList = products && Array.isArray(products.products) ? products.products : [];
  const fulfillmentStatus = fulfillment && Array.isArray(fulfillment.byStatus) ? fulfillment.byStatus : [];

  const figures: ReportFigures = {
    revenueMad: sales ? num(sales.revenueMad) : null,
    ordersTotal: sales ? num(sales.ordersTotal) : null,
    ordersDelivered: sales ? num(sales.ordersDelivered) : null,
    ordersWaiting: pending ? num(pending.count) : null,
    pendingPaymentConfirmations: countPendingPayment(pending),
    paymentMethods: byMethod
      .map((m) => {
        const r = asRecord(m);
        return r ? { method: String(r.paymentMethod ?? "—"), count: num(r.count) ?? 0, totalMad: num(r.totalMad) ?? 0 } : null;
      })
      .filter((m): m is MethodLine => m !== null)
      .sort((a, b) => b.totalMad - a.totalMad),
    paymentByStatus: byStatus
      .map((s) => {
        const r = asRecord(s);
        return r ? { status: String(r.status ?? "—"), count: num(r.count) ?? 0 } : null;
      })
      .filter((s): s is StatusLine => s !== null),
    topProducts: productList
      .map((p) => {
        const r = asRecord(p);
        return r ? { name: String(r.name ?? "—"), unitsSold: num(r.unitsSold) ?? 0 } : null;
      })
      .filter((p): p is ProductLine => p !== null && p.unitsSold > 0)
      .slice(0, 5),
    fulfillmentByStatus: fulfillmentStatus
      .map((s) => {
        const r = asRecord(s);
        return r ? { status: String(r.status ?? "—"), count: num(r.count) ?? 0 } : null;
      })
      .filter((s): s is StatusLine => s !== null),
    operationalAlerts: operationalAlerts(events),
  };

  return { type, windowLabel: def.window.label, figures, grounding, unavailable };
}
