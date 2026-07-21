/**
 * Safe internal business tools — the controlled service layer (spec §4 & §5).
 *
 * This is the ONLY way an AI module reads business data. There is no raw Prisma
 * handle, no SQL, no arbitrary field selection: a module calls `callTool(name,
 * input)` and every call passes through the same gate, in order:
 *
 *   1. global kill switch (AiOpsSettings.globalEnabled)
 *   2. module exists AND is enabled
 *   3. explicit permission grant for that exact tool (fail closed)
 *   4. per-module + per-tool rate limit
 *   5. strict input validation (whitelisted, clamped)
 *   6. the tool's own minimal, read-only query
 *   7. redaction of the result (secrets/PII/credentials)
 *   8. an AiToolCallLog row recording who called what and whether it worked
 *
 * Each tool returns only the minimum data required and never selects fields by
 * caller-supplied names. Customer personal data is kept out of the aggregate
 * tools entirely; the two person-scoped tools (getOrderDetails, getCustomer
 * history, getSupportConversation) return the minimum and rely on redaction to
 * strip contact details.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { formatPublicOrderNumber } from "@/lib/orderNumber";
import { getAiOpsSettings, getModuleConfig } from "../store";
import { evaluateStaticGate } from "../gate";
import { validateToolInput } from "./schemas";
import { checkToolPermission } from "../permissions";
import { consumeToolBudget } from "../rateLimit";
import { redactForAiContext } from "../redaction";
import { logToolCall } from "../executions";
import { isModuleKey, isToolName, type ModuleKey, type ToolName } from "../types";
import { resolveDateRange, type DateRangeInput } from "../dateRange";
import type {
  CustomerIdInput,
  LimitInput,
  OrderIdInput,
  PeriodLimitInput,
  RangeInput,
  RangeLimitInput,
  SupplierInput,
  SupportRefInput,
} from "./schemas";

/** Thrown by a tool when its (already shape-valid) input can't be resolved. */
class ToolInputError extends Error {}

export interface ToolCallContext {
  module: string;
  tool: string;
  input?: unknown;
  executionId?: string | null;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      status: "denied" | "invalid_input" | "rate_limited" | "error";
      error: string;
    };

const PENDING_ORDER_STATUSES = [
  "pending_payment",
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
];

/**
 * The single entry point. Runs the full gate and returns a safe, redacted
 * result. Never throws — failures are typed results and are logged.
 */
export async function callTool(ctx: ToolCallContext): Promise<ToolResult> {
  const startedAt = Date.now();
  const { module, tool } = ctx;

  // Steps 1–5 (unknown module/tool, global switch, module exists/enabled,
  // explicit permission) are the pure static gate. Gather the facts, then decide.
  const [settings, config] = await Promise.all([
    getAiOpsSettings(),
    isModuleKey(module) ? getModuleConfig(module) : Promise.resolve(null),
  ]);
  const gate = evaluateStaticGate({
    module,
    tool,
    globalEnabled: settings.globalEnabled,
    moduleExists: config !== null,
    moduleEnabled: config?.enabled ?? false,
    grantedTools: config?.grantedTools ?? [],
  });
  if (!gate.allowed) {
    await logToolCall({ module, tool, status: "denied", reason: gate.reason, executionId: ctx.executionId });
    return { ok: false, status: "denied", error: `Tool call denied (${gate.reason}).` };
  }

  // 4. Rate limit.
  const limit = consumeToolBudget(module, tool);
  if (!limit.allowed) {
    await logToolCall({ module, tool, status: "rate_limited", reason: "rate_limited", executionId: ctx.executionId });
    return { ok: false, status: "rate_limited", error: "Tool call rate limit exceeded." };
  }

  // 5. Input validation.
  const validation = validateToolInput(tool, ctx.input);
  if (!validation.ok) {
    await logToolCall({ module, tool, status: "invalid_input", reason: "invalid_input", executionId: ctx.executionId });
    return { ok: false, status: "invalid_input", error: validation.error };
  }

  // 6. Execute + 7. Redact. The gate guarantees `tool` is a valid ToolName.
  try {
    const raw = await runTool(tool as ToolName, validation.value, settings.timezone);
    const data = settings.redactSensitive ? redactForAiContext(raw) : raw;
    await logToolCall({
      module,
      tool,
      status: "success",
      durationMs: Date.now() - startedAt,
      executionId: ctx.executionId,
    });
    return { ok: true, data };
  } catch (error) {
    // A bad (but shape-valid) date range is caller error, not a query failure.
    const invalid = error instanceof ToolInputError;
    await logToolCall({
      module,
      tool,
      status: invalid ? "invalid_input" : "error",
      reason: invalid ? "invalid_input" : "query_failed",
      durationMs: Date.now() - startedAt,
      executionId: ctx.executionId,
    });
    return invalid
      ? { ok: false, status: "invalid_input", error: error.message }
      : { ok: false, status: "error", error: "Tool execution failed." };
  }
}

// ─── Tool implementations (minimal, read-only) ───────────────────────────────

function sinceDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Legacy lookback filter for the tools other modules still use (periodDays). */
function dayRange(periodDays: number, untilDays = 0): { gte: Date; lt?: Date } {
  const gte = sinceDays(periodDays);
  return untilDays > 0 ? { gte, lt: sinceDays(untilDays) } : { gte };
}

/** Resolve a validated date-range input to a `{ gte, lt }` filter + a label. */
function resolvedRange(range: DateRangeInput, timeZone: string) {
  const res = resolveDateRange(range, { timeZone });
  if (!res.ok) throw new ToolInputError(res.error);
  return { where: { gte: res.range.start, lt: res.range.end }, label: res.range.label };
}

async function runTool(tool: ToolName, input: unknown, timeZone: string): Promise<unknown> {
  switch (tool) {
    case "getSalesSummary":
      return getSalesSummary(input as RangeInput, timeZone);
    case "getOrderSummary":
      return getOrderSummary(input as RangeInput, timeZone);
    case "getPendingOrders":
      return getPendingOrders(input as LimitInput);
    case "getOrderDetails":
      return getOrderDetails(input as OrderIdInput);
    case "getPaymentSummary":
      return getPaymentSummary(input as RangeInput, timeZone);
    case "getFulfillmentPerformance":
      return getFulfillmentPerformance(input as RangeInput, timeZone);
    case "getCustomerMetrics":
      return getCustomerMetrics(input as RangeInput, timeZone);
    case "getOperationalIssues":
      return getOperationalIssues();
    case "getCustomerHistory":
      return getCustomerHistory(input as CustomerIdInput);
    case "getSupportConversation":
      return getSupportConversation(input as SupportRefInput);
    case "getSupplierProductCosts":
      return getSupplierProductCosts(input as SupplierInput);
    case "getSupplierApiHealth":
      return getSupplierApiHealth();
    case "getTopSellingProducts":
      return getTopSellingProducts(input as PeriodLimitInput);
    case "getProductPerformance":
      return getProductPerformance(input as RangeLimitInput, timeZone);
    case "getRecentOperationalEvents":
      return getRecentOperationalEvents(input as LimitInput);
    default:
      throw new Error("unreachable");
  }
}

async function getSalesSummary({ range }: RangeInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const delivered = await prisma.order.aggregate({
    _count: { _all: true },
    _sum: { totalMad: true },
    where: { status: "delivered", createdAt },
  });
  const allOrders = await prisma.order.count({ where: { createdAt } });
  return {
    range: label,
    ordersTotal: allOrders,
    ordersDelivered: delivered._count._all,
    revenueMad: delivered._sum.totalMad ?? 0,
    currency: "MAD",
  };
}

/** Order counts + value grouped by status over the range (incl. pending). */
async function getOrderSummary({ range }: RangeInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt },
    _count: { _all: true },
    _sum: { totalMad: true },
  });
  const byStatus = grouped.map((g) => ({
    status: g.status,
    count: g._count._all,
    totalMad: g._sum.totalMad ?? 0,
  }));
  const total = byStatus.reduce((n, g) => n + g.count, 0);
  const pending = byStatus
    .filter((g) => PENDING_ORDER_STATUSES.includes(g.status))
    .reduce((n, g) => n + g.count, 0);
  return { range: label, total, pending, byStatus };
}

async function getPendingOrders({ limit }: LimitInput) {
  const orders = await prisma.order.findMany({
    where: { status: { in: PENDING_ORDER_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: limit,
    // No customer name/email/phone — pending queue is an aggregate operational view.
    select: { id: true, status: true, totalMad: true, paymentMethod: true, createdAt: true },
  });
  // The public order number is the creation-rank (count of earlier orders + 1),
  // same as the admin/customer surfaces (see src/lib/auth.ts). We expose only
  // that human number, never the internal cuid, so answers match the dashboard.
  const withNumbers = await Promise.all(
    orders.map(async ({ id, createdAt, ...rest }) => {
      const earlier = await prisma.order.count({
        where: {
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
        },
      });
      return { orderNumber: formatPublicOrderNumber(earlier + 1), createdAt, ...rest };
    }),
  );
  return { count: withNumbers.length, orders: withNumbers };
}

async function getOrderDetails({ orderId }: OrderIdInput) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalMad: true,
      paymentMethod: true,
      createdAt: true,
      updatedAt: true,
      customerName: true,
      // Contact fields intentionally omitted; redaction would strip them anyway.
      items: { select: { id: true, productId: true, quantity: true, unitPriceMad: true } },
      supplierFulfillments: { select: { supplier: true, status: true, slotIndex: true } },
    },
  });
  if (!order) return { found: false };
  return { found: true, order };
}

async function getPaymentSummary({ range }: RangeInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const [byStatus, byMethod] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt },
      _count: { _all: true },
      _sum: { totalMad: true },
    }),
    // Breakdown by payment method answers "what payment methods were used?" —
    // an aggregate, no per-customer data.
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { createdAt },
      _count: { _all: true },
      _sum: { totalMad: true },
    }),
  ]);
  return {
    range: label,
    byStatus: byStatus.map((g) => ({
      status: g.status,
      count: g._count._all,
      totalMad: g._sum.totalMad ?? 0,
    })),
    byMethod: byMethod.map((g) => ({
      paymentMethod: g.paymentMethod,
      count: g._count._all,
      totalMad: g._sum.totalMad ?? 0,
    })),
  };
}

async function getFulfillmentPerformance({ range }: RangeInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const grouped = await prisma.supplierFulfillment.groupBy({
    by: ["status"],
    where: { createdAt },
    _count: { _all: true },
  });
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const failed = grouped
    .filter((g) => g.status === "failed" || g.status === "error")
    .reduce((n, g) => n + g._count._all, 0);
  return {
    range: label,
    total,
    failed,
    byStatus: grouped.map((g) => ({ status: g.status, count: g._count._all })),
  };
}

/** New/ordering-customer counts over the range (aggregate — no PII). */
async function getCustomerMetrics({ range }: RangeInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const [newCustomers, orderingRows] = await Promise.all([
    prisma.customer.count({ where: { createdAt } }),
    prisma.order.findMany({
      where: { createdAt, customerId: { not: null } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
  ]);
  const ordersInRange = await prisma.order.count({ where: { createdAt } });
  return {
    range: label,
    newCustomers,
    orderingCustomers: orderingRows.length,
    ordersInRange,
  };
}

/** Current operational issues needing attention — a now-snapshot (no range). */
async function getOperationalIssues() {
  const recentFailWindow = { gte: sinceDays(7) };
  const [paymentIssues, pendingOrders, failedFulfillments, suppliers] = await Promise.all([
    prisma.order.count({ where: { status: "payment_issue" } }),
    prisma.order.count({ where: { status: { in: PENDING_ORDER_STATUSES } } }),
    prisma.supplierFulfillment.count({
      where: { status: { in: ["failed", "error"] }, createdAt: recentFailWindow },
    }),
    prisma.supplier.findMany({
      where: { enabled: true },
      select: { id: true, lastSuccessAt: true, lastFailureAt: true },
    }),
  ]);
  const unhealthySuppliers = suppliers
    .filter(
      (s) => s.lastFailureAt && (!s.lastSuccessAt || s.lastFailureAt > s.lastSuccessAt),
    )
    .map((s) => s.id);
  return {
    asOf: "now",
    paymentIssues,
    pendingOrders,
    failedFulfillmentsLast7d: failedFulfillments,
    unhealthySuppliers,
  };
}

async function getCustomerHistory({ customerId }: CustomerIdInput) {
  const agg = await prisma.order.aggregate({
    _count: { _all: true },
    _sum: { totalMad: true },
    where: { customerId },
  });
  const recent = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, status: true, totalMad: true, createdAt: true },
  });
  return {
    customerId,
    ordersTotal: agg._count._all,
    lifetimeMad: agg._sum.totalMad ?? 0,
    recentOrders: recent,
  };
}

async function getSupportConversation({ reference }: SupportRefInput) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { reference },
    select: {
      reference: true,
      status: true,
      category: true,
      subIssueLabel: true,
      orderRef: true,
      message: true,
      replies: true,
      createdAt: true,
      updatedAt: true,
      // name/email/phone/attachments intentionally omitted (PII / blobs).
    },
  });
  if (!ticket) return { found: false };
  const replyCount = Array.isArray(ticket.replies) ? ticket.replies.length : 0;
  return {
    found: true,
    ticket: {
      reference: ticket.reference,
      status: ticket.status,
      category: ticket.category,
      subIssueLabel: ticket.subIssueLabel,
      orderRef: ticket.orderRef,
      message: ticket.message,
      replyCount,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    },
  };
}

async function getSupplierProductCosts({ supplier, limit }: SupplierInput) {
  const grouped = await prisma.supplierFulfillment.groupBy({
    by: ["supplier"],
    where: {
      status: "delivered",
      ...(supplier ? { supplier } : {}),
      costAmount: { not: null },
    },
    _count: { _all: true },
    _avg: { costAmount: true },
    _sum: { costAmount: true },
    orderBy: { supplier: "asc" },
    take: limit,
  });
  return {
    suppliers: grouped.map((g) => ({
      supplier: g.supplier,
      deliveredCount: g._count._all,
      avgCost: g._avg.costAmount ? Number(g._avg.costAmount) : null,
      totalCost: g._sum.costAmount ? Number(g._sum.costAmount) : null,
    })),
  };
}

async function getSupplierApiHealth() {
  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      enabled: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastCheckedAt: true,
      subscriptionActive: true,
      lastLatencyMs: true,
      // balances/thresholds/credentials intentionally omitted.
    },
    orderBy: { id: "asc" },
  });
  return { suppliers };
}

async function getTopSellingProducts({ periodDays, untilDays, limit }: PeriodLimitInput) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: "delivered", createdAt: dayRange(periodDays, untilDays) } },
    _sum: { quantity: true, unitPriceMad: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, category: true },
  });
  const nameOf = new Map(products.map((p) => [p.id, p]));
  return {
    periodDays,
    products: grouped.map((g) => ({
      productId: g.productId,
      name: nameOf.get(g.productId)?.name ?? null,
      category: nameOf.get(g.productId)?.category ?? null,
      unitsSold: g._sum.quantity ?? 0,
    })),
  };
}

/** Top products by units sold (delivered) over the range — "what sold best". */
async function getProductPerformance({ range, limit }: RangeLimitInput, timeZone: string) {
  const { where: createdAt, label } = resolvedRange(range, timeZone);
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: "delivered", createdAt } },
    _sum: { quantity: true },
    _count: { _all: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, category: true },
  });
  const meta = new Map(products.map((p) => [p.id, p]));
  return {
    range: label,
    products: grouped.map((g) => ({
      productId: g.productId,
      name: meta.get(g.productId)?.name ?? null,
      category: meta.get(g.productId)?.category ?? null,
      unitsSold: g._sum.quantity ?? 0,
      orderLines: g._count._all,
    })),
  };
}

async function getRecentOperationalEvents({ limit }: LimitInput) {
  const [supplierLogs, jobRuns] = await Promise.all([
    prisma.supplierLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { supplierId: true, requestType: true, ok: true, responseTimeMs: true, createdAt: true },
    }),
    prisma.scheduledJobRun.findMany({
      orderBy: { updatedAt: "desc" },
      select: { job: true, status: true, lastSuccessAt: true, lastFailureAt: true, consecutiveFailures: true },
    }),
  ]);
  return { supplierLogs, jobRuns };
}

/** Exposed for the permission/list UI: the tools a given module MAY call. */
export function toolsForModule(module: ModuleKey, grantedTools: ToolName[]): ToolName[] {
  return grantedTools.filter((t) => checkToolPermission(module, t, grantedTools).allowed);
}
