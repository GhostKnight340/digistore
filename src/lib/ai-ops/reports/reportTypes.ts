/**
 * Daily Reports — the report-type registry (spec: Daily Reports module).
 *
 * The four executive reports all belong to the single `daily_reports` AI
 * module, but each is independently configurable and scheduled. Following the
 * repo convention (no Prisma enums), the allowed report-type set is a
 * TypeScript union here and the AiReportSchedule row carries an inline comment
 * pointing back. Kept free of `server-only`, Prisma, and Node imports so it can
 * be used from both server code and pure unit tests.
 *
 * Every report reads ONLY through the safe tool layer; the tools each report
 * needs are listed here and MUST be a subset of the `daily_reports` module's
 * default grants (asserted in a test) — a report can never read data the module
 * was not granted.
 */

import type { ToolName } from "../types";
import type { DatePreset } from "../dateRange";

export const REPORT_TYPES = ["morning", "evening", "weekly", "monthly"] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

/**
 * The lookback window a report's metrics cover, expressed with the safe tools'
 * own `periodDays`/`untilDays` semantics (a rolling window ending `untilDays`
 * ago). These are rolling windows, not calendar-aligned — matching how the
 * Discord assistant scopes time — and are labelled honestly in the report.
 */
export interface ReportWindow {
  /**
   * Date-range preset for the range-based safe tools (getSalesSummary,
   * getPaymentSummary, getFulfillmentPerformance) — timezone-aware, calendar
   * aligned. These tools take `{ range: { preset } }`.
   */
  preset: DatePreset;
  /** periodDays/untilDays for the period-based tool getTopSellingProducts. */
  periodDays: number;
  untilDays: number;
  /** Human label stated in the report so a figure is never mis-attributed. */
  label: string;
}

export interface ReportDefinition {
  type: ReportType;
  /** Emoji + human title used in Discord and the admin UI. */
  emoji: string;
  title: string;
  /** One-line description for the admin UI. */
  description: string;
  /** Default cron (interpreted in the configured timezone). */
  defaultSchedule: string;
  /** The window the report's figures cover. */
  window: ReportWindow;
  /** Safe tools this report pulls. MUST ⊆ daily_reports default grants. */
  tools: ToolName[];
}

export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  morning: {
    type: "morning",
    emoji: "🌅",
    title: "Morning Brief",
    description: "Executive brief every morning: yesterday's numbers + today's priorities.",
    defaultSchedule: "0 8 * * *", // 08:00 local
    window: { preset: "yesterday", periodDays: 2, untilDays: 1, label: "yesterday" },
    tools: [
      "getSalesSummary",
      "getPendingOrders",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
  evening: {
    type: "evening",
    emoji: "🌙",
    title: "End of Day Report",
    description: "Wrap-up every evening: today's revenue, orders, and incidents.",
    defaultSchedule: "0 22 * * *", // 22:00 local
    window: { preset: "today", periodDays: 1, untilDays: 0, label: "today" },
    tools: [
      "getSalesSummary",
      "getPendingOrders",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
  weekly: {
    type: "weekly",
    emoji: "📅",
    title: "Weekly Report",
    description: "Every Monday morning: the last 7 days, trends, and best/worst products.",
    defaultSchedule: "0 9 * * 1", // Monday 09:00 local
    window: { preset: "last_7_days", periodDays: 7, untilDays: 0, label: "the last 7 days" },
    tools: [
      "getSalesSummary",
      "getPendingOrders",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
  monthly: {
    type: "monthly",
    emoji: "📈",
    title: "Monthly Report",
    description: "First of every month: the last 30 days, customer growth, and priorities.",
    defaultSchedule: "0 9 1 * *", // 1st of the month, 09:00 local
    window: { preset: "last_month", periodDays: 30, untilDays: 0, label: "last month" },
    tools: [
      "getSalesSummary",
      "getPendingOrders",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
};

export function reportDefinition(type: ReportType): ReportDefinition {
  return REPORT_DEFINITIONS[type];
}

export function reportLabel(type: string): string {
  return isReportType(type) ? `${REPORT_DEFINITIONS[type].emoji} ${REPORT_DEFINITIONS[type].title}` : type;
}
