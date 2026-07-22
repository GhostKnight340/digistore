/**
 * Daily Reports — period-over-period comparison (PURE: no server-only, no DB).
 *
 * The spec's whole premise is interpretation: "what changed", "what is unusual",
 * "compared with the recent baseline". None of that is computable from a single
 * window, so every report also pulls the *previous* equal window and this module
 * turns the two figure sets into deterministic deltas.
 *
 * Two responsibilities, both pure and unit-testable:
 *   - `baselineRange(type, now, tz)` → the calendar-date window immediately
 *     before the report's window, expressed as a custom range the safe tools
 *     accept (`{ range: { start, end } }`).
 *   - `computeComparison(current, previous)` → the deltas the model reads and the
 *     formatter/fallback quote. Numbers are computed here, never by the model.
 *
 * Every percentage is pre-formatted as a string here so the model only ever
 * *quotes* it — it never does arithmetic (the anti-hallucination contract).
 */

import type { DateRangeInput } from "../dateRange";
import { DEFAULT_TIMEZONE } from "../dateRange";
import type { ReportType } from "./reportTypes";

/** The subset of a window's figures that has a meaningful previous-period peer. */
export interface ComparableFigures {
  revenueMad: number | null;
  ordersTotal: number | null;
  ordersDelivered: number | null;
  /** count by payment method (the mix), keyed for movement detection. */
  paymentMethods: { method: string; count: number }[];
  /** units sold per product, for demand-movement detection. */
  topProducts: { name: string; unitsSold: number }[];
  /** failed/errored supplier fulfillments in the window. */
  fulfillmentFailed: number | null;
}

export type Direction = "up" | "down" | "flat" | "unknown";

/** A scalar figure vs its previous-period value. `deltaPct` is pre-formatted. */
export interface FigureDelta {
  current: number | null;
  previous: number | null;
  deltaAbs: number | null;
  /** e.g. "+12%", "-8%", or null when a percentage is undefined (prev 0/null). */
  deltaPct: string | null;
  direction: Direction;
}

export type MovementStatus = "new" | "up" | "down" | "flat" | "gone";

export interface ProductMovement {
  name: string;
  current: number;
  previous: number;
  status: MovementStatus;
  deltaPct: string | null;
}

export interface MethodMovement {
  method: string;
  current: number;
  previous: number;
  deltaAbs: number;
}

export interface ReportComparison {
  /** Human label for the compared-against window, stated in the report. */
  baselineLabel: string;
  /** The report's own window is still in progress (evening/today). */
  currentIsPartial: boolean;
  /** False when the baseline window could not be read — no deltas are trustworthy. */
  available: boolean;
  revenue: FigureDelta;
  ordersTotal: FigureDelta;
  ordersDelivered: FigureDelta;
  fulfillmentFailed: FigureDelta;
  /** Products whose demand moved most, largest absolute change first. */
  productMovements: ProductMovement[];
  /** Payment methods whose usage moved most, largest absolute change first. */
  methodMovements: MethodMovement[];
}

// ── Baseline window ──────────────────────────────────────────────────────────

interface Ymd {
  year: number;
  month: number; // 1-based
  day: number;
}

/** The wall-clock calendar date in the business timezone for an instant. */
function zonedYmd(instant: Date, timeZone: string): Ymd {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Calendar-correct whole-day shift (crosses months/years/DST safely). */
function shiftDays({ year, month, day }: Ymd, delta: number): Ymd {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function iso({ year, month, day }: Ymd): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whole-month shift, clamped to the last day of the target month. */
function shiftMonths({ year, month, day }: Ymd, delta: number): Ymd {
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth(); // 0-based
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { year: y, month: m + 1, day: Math.min(day, lastDay) };
}

export interface BaselineWindow {
  /** Custom range the range-based safe tools accept. */
  range: DateRangeInput;
  /** untilDays offset for the period-based getTopSellingProducts baseline. */
  productUntilDays: number;
  /** Human label for the compared-against period. */
  label: string;
  /** The current report window is still in progress. */
  currentIsPartial: boolean;
}

/**
 * The window immediately preceding a report's window — the "recent baseline" the
 * report compares against. Calendar-aligned (not partial), so a full period is
 * always compared with a full period.
 */
export function baselineWindow(type: ReportType, now: Date, timeZone: string = DEFAULT_TIMEZONE): BaselineWindow {
  const today = zonedYmd(now, timeZone);
  switch (type) {
    case "morning": {
      // Report covers yesterday → compare with the day before yesterday.
      const d = shiftDays(today, -2);
      return { range: { start: iso(d), end: iso(d) }, productUntilDays: 3, label: "the day before", currentIsPartial: false };
    }
    case "evening": {
      // Report covers today so far → compare with all of yesterday.
      const d = shiftDays(today, -1);
      return { range: { start: iso(d), end: iso(d) }, productUntilDays: 1, label: "yesterday", currentIsPartial: true };
    }
    case "weekly": {
      // Report covers the last 7 days → compare with the 7 days before those.
      const start = shiftDays(today, -14);
      const end = shiftDays(today, -8);
      return { range: { start: iso(start), end: iso(end) }, productUntilDays: 7, label: "the previous 7 days", currentIsPartial: false };
    }
    case "monthly": {
      // Report covers last month → compare with the month before it.
      const anchor = shiftMonths(today, -2);
      const start: Ymd = { year: anchor.year, month: anchor.month, day: 1 };
      const lastDay = new Date(Date.UTC(anchor.year, anchor.month, 0)).getUTCDate();
      const end: Ymd = { year: anchor.year, month: anchor.month, day: lastDay };
      return { range: { start: iso(start), end: iso(end) }, productUntilDays: 60, label: "the month before", currentIsPartial: false };
    }
  }
}

// ── Delta computation ────────────────────────────────────────────────────────

function pct(current: number, previous: number): string | null {
  if (previous === 0) return null; // undefined percentage — don't invent one
  const ratio = ((current - previous) / previous) * 100;
  const rounded = Math.round(ratio);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** How much is "meaningful" — smaller moves are treated as flat, per the spec. */
const FLAT_ABS = 1e-9;

function delta(current: number | null, previous: number | null): FigureDelta {
  if (current == null || previous == null) {
    return { current, previous, deltaAbs: null, deltaPct: null, direction: "unknown" };
  }
  const deltaAbs = current - previous;
  const direction: Direction = deltaAbs > FLAT_ABS ? "up" : deltaAbs < -FLAT_ABS ? "down" : "flat";
  return { current, previous, deltaAbs, deltaPct: pct(current, previous), direction };
}

function movementStatus(current: number, previous: number): MovementStatus {
  if (previous === 0 && current > 0) return "new";
  if (current === 0 && previous > 0) return "gone";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/**
 * Turns two figure sets into deterministic deltas. `available: false` when the
 * baseline could not be read (its figures are null) — the report then avoids all
 * "what changed" claims rather than comparing against nothing.
 */
export function computeComparison(
  current: ComparableFigures,
  previous: ComparableFigures | null,
  meta: { baselineLabel: string; currentIsPartial: boolean; available: boolean },
): ReportComparison {
  const prev = previous ?? {
    revenueMad: null,
    ordersTotal: null,
    ordersDelivered: null,
    paymentMethods: [],
    topProducts: [],
    fulfillmentFailed: null,
  };

  // Product movement: union of both windows' products, keyed by name.
  const prevUnits = new Map(prev.topProducts.map((p) => [p.name, p.unitsSold]));
  const curUnits = new Map(current.topProducts.map((p) => [p.name, p.unitsSold]));
  const productNames = new Set([...prevUnits.keys(), ...curUnits.keys()]);
  const productMovements: ProductMovement[] = [...productNames]
    .map((name) => {
      const cur = curUnits.get(name) ?? 0;
      const was = prevUnits.get(name) ?? 0;
      return { name, current: cur, previous: was, status: movementStatus(cur, was), deltaPct: was > 0 ? pct(cur, was) : null };
    })
    .filter((m) => m.status !== "flat")
    .sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous))
    .slice(0, 5);

  const prevMethods = new Map(prev.paymentMethods.map((m) => [m.method, m.count]));
  const curMethods = new Map(current.paymentMethods.map((m) => [m.method, m.count]));
  const methodNames = new Set([...prevMethods.keys(), ...curMethods.keys()]);
  const methodMovements: MethodMovement[] = [...methodNames]
    .map((method) => {
      const cur = curMethods.get(method) ?? 0;
      const was = prevMethods.get(method) ?? 0;
      return { method, current: cur, previous: was, deltaAbs: cur - was };
    })
    .filter((m) => m.deltaAbs !== 0)
    .sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs))
    .slice(0, 5);

  return {
    baselineLabel: meta.baselineLabel,
    currentIsPartial: meta.currentIsPartial,
    available: meta.available,
    revenue: delta(current.revenueMad, prev.revenueMad),
    ordersTotal: delta(current.ordersTotal, prev.ordersTotal),
    ordersDelivered: delta(current.ordersDelivered, prev.ordersDelivered),
    fulfillmentFailed: delta(current.fulfillmentFailed, prev.fulfillmentFailed),
    productMovements,
    methodMovements,
  };
}
