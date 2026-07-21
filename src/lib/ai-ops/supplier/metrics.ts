/**
 * Supplier Intelligence — deterministic metric gathering (spec: Supplier
 * Intelligence — "Monitors Reloadly & FazerCards costs, availability and API
 * health").
 *
 * The ONLY data source, and it NEVER touches Prisma: every figure comes from the
 * safe tool layer (`callTool`), so all permission, rate-limit, redaction, and
 * logging guarantees apply. A denied/failed tool is recorded as unavailable —
 * its figures stay null and are surfaced as "could not be retrieved" rather than
 * invented. The AI only writes prose over these computed figures.
 */

import "server-only";

import { callTool } from "../tools/service";
import { SUPPLIER_INTELLIGENCE_MODULE } from "./module";

/** Tools this module pulls. MUST ⊆ supplier_intelligence default grants. */
const SUPPLIER_TOOLS = ["getSupplierApiHealth", "getSupplierProductCosts", "getFulfillmentPerformance"] as const;

const FULFILLMENT_WINDOW = "the last 7 days";
const HIGH_LATENCY_MS = 5000;

function toolInput(tool: (typeof SUPPLIER_TOOLS)[number]): unknown {
  switch (tool) {
    case "getSupplierProductCosts":
      return { limit: 25 };
    case "getFulfillmentPerformance":
      return { range: { preset: "last_7_days" } };
    default:
      return {};
  }
}

export type HealthStatus = "healthy" | "degraded" | "down";

export interface SupplierHealthLine {
  id: string;
  enabled: boolean;
  subscriptionActive: boolean | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  status: HealthStatus;
}

export interface SupplierCostLine {
  supplier: string;
  deliveredCount: number;
  avgCost: number | null;
  totalCost: number | null;
}

export interface StatusLine {
  status: string;
  count: number;
}

export interface SupplierFigures {
  suppliers: SupplierHealthLine[];
  costs: SupplierCostLine[];
  fulfillment: { total: number | null; failed: number | null; byStatus: StatusLine[] };
  alerts: string[];
}

export interface SupplierMetrics {
  windowLabel: string;
  figures: SupplierFigures;
  unavailable: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function iso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}
function tstamp(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

function healthStatus(h: {
  enabled: boolean;
  subscriptionActive: boolean | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
}): HealthStatus {
  if (!h.enabled) return "down";
  if (h.subscriptionActive === false) return "degraded";
  if (h.lastFailureAt && tstamp(h.lastFailureAt) > tstamp(h.lastSuccessAt)) return "degraded";
  if (h.lastLatencyMs != null && h.lastLatencyMs > HIGH_LATENCY_MS) return "degraded";
  return "healthy";
}

function computeAlerts(suppliers: SupplierHealthLine[], failedFulfillments: number | null): string[] {
  const alerts: string[] = [];
  for (const s of suppliers) {
    if (!s.enabled) {
      alerts.push(`${s.id} is DISABLED`);
      continue;
    }
    if (s.subscriptionActive === false) alerts.push(`${s.id} subscription is INACTIVE`);
    if (s.lastFailureAt && tstamp(s.lastFailureAt) > tstamp(s.lastSuccessAt)) {
      alerts.push(`${s.id}: last API call FAILED`);
    }
    if (s.lastLatencyMs != null && s.lastLatencyMs > HIGH_LATENCY_MS) {
      alerts.push(`${s.id} API latency high (${s.lastLatencyMs}ms)`);
    }
  }
  if (failedFulfillments && failedFulfillments > 0) {
    alerts.push(`${failedFulfillments} failed fulfillment(s) in ${FULFILLMENT_WINDOW}`);
  }
  return alerts.slice(0, 12);
}

/**
 * Gathers supplier metrics through the safe tool layer. `executionId` correlates
 * every tool call to the run. A failed tool is recorded as unavailable rather
 * than aborting.
 */
export async function gatherSupplierMetrics(executionId: string | null): Promise<SupplierMetrics> {
  const unavailable: string[] = [];
  const data: Record<string, Record<string, unknown> | null> = {};

  for (const tool of SUPPLIER_TOOLS) {
    const result = await callTool({
      module: SUPPLIER_INTELLIGENCE_MODULE,
      tool,
      input: toolInput(tool),
      executionId,
    });
    if (result.ok) {
      data[tool] = asRecord(result.data);
    } else {
      data[tool] = null;
      unavailable.push(tool);
    }
  }

  const health = data.getSupplierApiHealth;
  const costData = data.getSupplierProductCosts;
  const fulfillment = data.getFulfillmentPerformance;

  const healthList = health && Array.isArray(health.suppliers) ? health.suppliers : [];
  const suppliers: SupplierHealthLine[] = healthList
    .map((s) => {
      const r = asRecord(s);
      if (!r || typeof r.id !== "string") return null;
      const line = {
        id: r.id,
        enabled: r.enabled !== false,
        subscriptionActive: typeof r.subscriptionActive === "boolean" ? r.subscriptionActive : null,
        lastSuccessAt: iso(r.lastSuccessAt),
        lastFailureAt: iso(r.lastFailureAt),
        lastLatencyMs: num(r.lastLatencyMs),
      };
      return { ...line, status: healthStatus(line) };
    })
    .filter((s): s is SupplierHealthLine => s !== null);

  const costList = costData && Array.isArray(costData.suppliers) ? costData.suppliers : [];
  const costs: SupplierCostLine[] = costList
    .map((c) => {
      const r = asRecord(c);
      return r && typeof r.supplier === "string"
        ? {
            supplier: r.supplier,
            deliveredCount: num(r.deliveredCount) ?? 0,
            avgCost: num(r.avgCost),
            totalCost: num(r.totalCost),
          }
        : null;
    })
    .filter((c): c is SupplierCostLine => c !== null);

  const fulByStatus = fulfillment && Array.isArray(fulfillment.byStatus) ? fulfillment.byStatus : [];
  const fulfillmentFigures = {
    total: fulfillment ? num(fulfillment.total) : null,
    failed: fulfillment ? num(fulfillment.failed) : null,
    byStatus: fulByStatus
      .map((s) => {
        const r = asRecord(s);
        return r ? { status: String(r.status ?? "—"), count: num(r.count) ?? 0 } : null;
      })
      .filter((s): s is StatusLine => s !== null),
  };

  return {
    windowLabel: FULFILLMENT_WINDOW,
    figures: {
      suppliers,
      costs,
      fulfillment: fulfillmentFigures,
      alerts: computeAlerts(suppliers, fulfillmentFigures.failed),
    },
    unavailable,
  };
}
