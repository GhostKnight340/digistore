/**
 * Safe-business-tool input validation — pure, no DB, no zod.
 *
 * The repo has no zod (validation is manual everywhere), so each tool gets a
 * hand-written validator returning a discriminated result. Validation is a
 * security control (spec §4: "validate every input", "prevent arbitrary field
 * selection", "prevent arbitrary database queries"): inputs are whitelisted,
 * coerced, and clamped — a tool never accepts a raw field list, an ORDER BY, a
 * WHERE fragment, or an unbounded limit.
 *
 * Kept free of `server-only` so validators are unit-testable directly.
 */

import { isToolName, type ToolName } from "../types";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const err = (error: string): ValidationResult<never> => ({ ok: false, error });

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

/** Coerce to an integer within [min,max], falling back to `dflt`. Never throws. */
function clampedInt(value: unknown, min: number, max: number, dflt: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** A safe id: non-empty, bounded length, no whitespace/control chars. */
function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9_#\-]+$/.test(value)
  );
}

// ─── Per-tool input types ────────────────────────────────────────────────────

export interface PeriodInput {
  periodDays: number;
}
export interface LimitInput {
  limit: number;
}
export interface PeriodLimitInput {
  periodDays: number;
  limit: number;
}
export interface OrderIdInput {
  orderId: string;
}
export interface CustomerIdInput {
  customerId: string;
}
export interface SupportRefInput {
  reference: string;
}
export interface SupplierInput {
  supplier: string | null;
  limit: number;
}
export interface ProductPerfInput {
  productId: string | null;
  periodDays: number;
}

// ─── Validators, keyed by tool name ──────────────────────────────────────────

function period(input: unknown): ValidationResult<PeriodInput> {
  return ok({ periodDays: clampedInt(asObject(input).periodDays, 1, 365, 7) });
}

function limit(input: unknown): ValidationResult<LimitInput> {
  return ok({ limit: clampedInt(asObject(input).limit, 1, 100, 20) });
}

function periodLimit(input: unknown): ValidationResult<PeriodLimitInput> {
  const o = asObject(input);
  return ok({
    periodDays: clampedInt(o.periodDays, 1, 365, 30),
    limit: clampedInt(o.limit, 1, 50, 10),
  });
}

function orderId(input: unknown): ValidationResult<OrderIdInput> {
  const v = asObject(input).orderId;
  if (!validId(v)) return err("orderId is required and must be a valid id.");
  return ok({ orderId: v });
}

function customerId(input: unknown): ValidationResult<CustomerIdInput> {
  const v = asObject(input).customerId;
  if (!validId(v)) return err("customerId is required and must be a valid id.");
  return ok({ customerId: v });
}

function supportRef(input: unknown): ValidationResult<SupportRefInput> {
  const v = asObject(input).reference;
  if (!validId(v)) return err("reference is required and must be a valid ticket reference.");
  return ok({ reference: v });
}

function supplier(input: unknown): ValidationResult<SupplierInput> {
  const o = asObject(input);
  let sup: string | null = null;
  if (o.supplier !== undefined && o.supplier !== null) {
    if (typeof o.supplier !== "string" || !/^[a-z0-9_-]{1,32}$/i.test(o.supplier)) {
      return err("supplier must be a supplier slug.");
    }
    sup = o.supplier;
  }
  return ok({ supplier: sup, limit: clampedInt(o.limit, 1, 100, 25) });
}

function productPerf(input: unknown): ValidationResult<ProductPerfInput> {
  const o = asObject(input);
  let pid: string | null = null;
  if (o.productId !== undefined && o.productId !== null) {
    if (!validId(o.productId)) return err("productId must be a valid id.");
    pid = o.productId;
  }
  return ok({ productId: pid, periodDays: clampedInt(o.periodDays, 1, 365, 30) });
}

/** The validator table. Every ToolName MUST have an entry. */
export const TOOL_VALIDATORS: Record<ToolName, (input: unknown) => ValidationResult<unknown>> = {
  getSalesSummary: period,
  getPendingOrders: limit,
  getOrderDetails: orderId,
  getPaymentSummary: period,
  getFulfillmentPerformance: period,
  getCustomerHistory: customerId,
  getSupportConversation: supportRef,
  getSupplierProductCosts: supplier,
  getSupplierApiHealth: (input) => ok(asObject(input) && {}),
  getTopSellingProducts: periodLimit,
  getProductPerformance: productPerf,
  getRecentOperationalEvents: limit,
};

/** Validate `input` for `tool`. Unknown tool → error (fail closed). */
export function validateToolInput(
  tool: string,
  input: unknown,
): ValidationResult<unknown> {
  if (!isToolName(tool)) return err(`Unknown tool: ${tool}`);
  return TOOL_VALIDATORS[tool](input);
}
