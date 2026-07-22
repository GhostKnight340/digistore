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
import { isDatePreset, type DateRangeInput } from "../dateRange";

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
  /** Upper bound of the window, in days ago (0 = now). Enables past ranges. */
  untilDays: number;
}
export interface LimitInput {
  limit: number;
}
export interface PeriodLimitInput {
  periodDays: number;
  untilDays: number;
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
/** A validated date-range request (preset or custom), resolved at execution. */
export interface RangeInput {
  range: DateRangeInput;
}
export interface RangeLimitInput {
  range: DateRangeInput;
  limit: number;
}
export interface InstagramLimitInput {
  limit: number;
}
export interface InstagramMediaInput {
  mediaId: string;
}

// ─── Validators, keyed by tool name ──────────────────────────────────────────

/** Clamp an optional upper bound so the window is always valid: 0 ≤ untilDays < periodDays. */
function clampUntil(input: Record<string, unknown>, periodDays: number): number {
  const until = clampedInt(input.untilDays, 0, 364, 0);
  return Math.min(until, periodDays - 1);
}

function period(input: unknown): ValidationResult<PeriodInput> {
  const o = asObject(input);
  const periodDays = clampedInt(o.periodDays, 1, 365, 7);
  return ok({ periodDays, untilDays: clampUntil(o, periodDays) });
}

function limit(input: unknown): ValidationResult<LimitInput> {
  return ok({ limit: clampedInt(asObject(input).limit, 1, 100, 20) });
}

function periodLimit(input: unknown): ValidationResult<PeriodLimitInput> {
  const o = asObject(input);
  const periodDays = clampedInt(o.periodDays, 1, 365, 30);
  return ok({
    periodDays,
    untilDays: clampUntil(o, periodDays),
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

/**
 * Validate a `range` input's SHAPE only — a known preset, or a custom
 * {start,end} pair of YYYY-MM-DD strings. Timezone-aware resolution and bound
 * checks happen at execution (service.ts), where the business timezone is known.
 * Defaults to "today" when omitted. Never accepts arbitrary fields.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function rangeOf(o: Record<string, unknown>): ValidationResult<DateRangeInput> {
  const r = o.range;
  if (r && typeof r === "object" && !Array.isArray(r)) {
    const ro = r as Record<string, unknown>;
    if (typeof ro.preset === "string") {
      if (!isDatePreset(ro.preset)) return err(`Unknown date preset: ${ro.preset}`);
      return ok({ preset: ro.preset });
    }
    if (ro.start !== undefined || ro.end !== undefined) {
      if (
        typeof ro.start !== "string" ||
        typeof ro.end !== "string" ||
        !ISO_DATE.test(ro.start) ||
        !ISO_DATE.test(ro.end)
      ) {
        return err("Custom range needs start and end as YYYY-MM-DD.");
      }
      return ok({ start: ro.start, end: ro.end });
    }
  }
  return ok({ preset: "today" });
}

function rangeInput(input: unknown): ValidationResult<RangeInput> {
  const res = rangeOf(asObject(input));
  return res.ok ? ok({ range: res.value }) : res;
}

function rangeLimit(input: unknown): ValidationResult<RangeLimitInput> {
  const o = asObject(input);
  const res = rangeOf(o);
  if (!res.ok) return res;
  return ok({ range: res.value, limit: clampedInt(o.limit, 1, 50, 10) });
}

/** Tools that take no input (current-state snapshots). */
function noInput(input: unknown): ValidationResult<Record<string, never>> {
  return ok(asObject(input) && {});
}

/** Instagram recent-media limit (bounded small — a Composio read per call). */
function instagramLimit(input: unknown): ValidationResult<InstagramLimitInput> {
  return ok({ limit: clampedInt(asObject(input).limit, 1, 24, 12) });
}

/** Instagram comments require a valid media id. */
function instagramMedia(input: unknown): ValidationResult<InstagramMediaInput> {
  const v = asObject(input).mediaId;
  if (!validId(v)) return err("mediaId is required and must be a valid Instagram media id.");
  return ok({ mediaId: v });
}

/** The validator table. Every ToolName MUST have an entry. */
export const TOOL_VALIDATORS: Record<ToolName, (input: unknown) => ValidationResult<unknown>> = {
  getSalesSummary: rangeInput,
  getOrderSummary: rangeInput,
  getPendingOrders: limit,
  getOrderDetails: orderId,
  getPaymentSummary: rangeInput,
  getFulfillmentPerformance: rangeInput,
  getCustomerMetrics: rangeInput,
  getOperationalIssues: noInput,
  getCustomerHistory: customerId,
  getSupportConversation: supportRef,
  getSupplierProductCosts: supplier,
  getSupplierApiHealth: noInput,
  getTopSellingProducts: periodLimit,
  getProductPerformance: rangeLimit,
  getMarginSummary: rangeInput,
  getRecentOperationalEvents: limit,
  getInstagramProfile: noInput,
  getInstagramRecentMedia: instagramLimit,
  getInstagramComments: instagramMedia,
};

/** Validate `input` for `tool`. Unknown tool → error (fail closed). */
export function validateToolInput(
  tool: string,
  input: unknown,
): ValidationResult<unknown> {
  if (!isToolName(tool)) return err(`Unknown tool: ${tool}`);
  return TOOL_VALIDATORS[tool](input);
}
