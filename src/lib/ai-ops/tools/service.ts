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
import { getAiOpsSettings, getModuleConfig } from "../store";
import { evaluateStaticGate } from "../gate";
import { validateToolInput } from "./schemas";
import { checkToolPermission } from "../permissions";
import { consumeToolBudget } from "../rateLimit";
import { redactForAiContext } from "../redaction";
import { logToolCall } from "../executions";
import { isModuleKey, isToolName, type ModuleKey, type ToolName } from "../types";
import type {
  CustomerIdInput,
  LimitInput,
  OrderIdInput,
  PeriodInput,
  PeriodLimitInput,
  ProductPerfInput,
  SupplierInput,
  SupportRefInput,
} from "./schemas";

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
    const raw = await runTool(tool as ToolName, validation.value);
    const data = settings.redactSensitive ? redactForAiContext(raw) : raw;
    await logToolCall({
      module,
      tool,
      status: "success",
      durationMs: Date.now() - startedAt,
      executionId: ctx.executionId,
    });
    return { ok: true, data };
  } catch {
    await logToolCall({
      module,
      tool,
      status: "error",
      reason: "query_failed",
      durationMs: Date.now() - startedAt,
      executionId: ctx.executionId,
    });
    return { ok: false, status: "error", error: "Tool execution failed." };
  }
}

// ─── Tool implementations (minimal, read-only) ───────────────────────────────

function sinceDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function runTool(tool: ToolName, input: unknown): Promise<unknown> {
  switch (tool) {
    case "getSalesSummary":
      return getSalesSummary(input as PeriodInput);
    case "getPendingOrders":
      return getPendingOrders(input as LimitInput);
    case "getOrderDetails":
      return getOrderDetails(input as OrderIdInput);
    case "getPaymentSummary":
      return getPaymentSummary(input as PeriodInput);
    case "getFulfillmentPerformance":
      return getFulfillmentPerformance(input as PeriodInput);
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
      return getProductPerformance(input as ProductPerfInput);
    case "getRecentOperationalEvents":
      return getRecentOperationalEvents(input as LimitInput);
    default:
      throw new Error("unreachable");
  }
}

async function getSalesSummary({ periodDays }: PeriodInput) {
  const since = sinceDays(periodDays);
  const delivered = await prisma.order.aggregate({
    _count: { _all: true },
    _sum: { totalMad: true },
    where: { status: "delivered", createdAt: { gte: since } },
  });
  const allOrders = await prisma.order.count({ where: { createdAt: { gte: since } } });
  return {
    periodDays,
    ordersTotal: allOrders,
    ordersDelivered: delivered._count._all,
    revenueMad: delivered._sum.totalMad ?? 0,
    currency: "MAD",
  };
}

async function getPendingOrders({ limit }: LimitInput) {
  const orders = await prisma.order.findMany({
    where: { status: { in: PENDING_ORDER_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: limit,
    // No customer name/email/phone — pending queue is an aggregate operational view.
    select: { id: true, status: true, totalMad: true, paymentMethod: true, createdAt: true },
  });
  return { count: orders.length, orders };
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

async function getPaymentSummary({ periodDays }: PeriodInput) {
  const since = sinceDays(periodDays);
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { totalMad: true },
  });
  return {
    periodDays,
    byStatus: grouped.map((g) => ({
      status: g.status,
      count: g._count._all,
      totalMad: g._sum.totalMad ?? 0,
    })),
  };
}

async function getFulfillmentPerformance({ periodDays }: PeriodInput) {
  const since = sinceDays(periodDays);
  const grouped = await prisma.supplierFulfillment.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  return {
    periodDays,
    total,
    byStatus: grouped.map((g) => ({ status: g.status, count: g._count._all })),
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

async function getTopSellingProducts({ periodDays, limit }: PeriodLimitInput) {
  const since = sinceDays(periodDays);
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: "delivered", createdAt: { gte: since } } },
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

async function getProductPerformance({ productId, periodDays }: ProductPerfInput) {
  const since = sinceDays(periodDays);
  const where = {
    order: { status: "delivered", createdAt: { gte: since } },
    ...(productId ? { productId } : {}),
  };
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where,
    _sum: { quantity: true },
    _count: { _all: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 25,
  });
  return {
    periodDays,
    productId: productId ?? null,
    items: grouped.map((g) => ({
      productId: g.productId,
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
