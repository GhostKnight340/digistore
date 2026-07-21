/**
 * Daily Reports scheduling — the report-specific "is this report due?" decision
 * (PURE: no server-only, no DB, no provider).
 *
 * The pure cron/timezone primitives live in src/lib/ai-ops/cron.ts (shared with
 * the base scheduler); this module combines them with the base lock/idempotency
 * rules for the per-report AiReportSchedule rows. The cron helpers are re-exported
 * so existing importers/tests keep working.
 */

import { evaluateDue, isLockHeld, type JobLockState } from "../scheduler";
import {
  cronMatchesHour,
  nextFiringTime,
  parseCron,
  zonedParts,
  type ParsedCron,
  type ZonedParts,
} from "../cron";

export { parseCron, zonedParts, cronMatchesHour, nextFiringTime, isLockHeld };
export type { ParsedCron, ZonedParts };

/**
 * A stable idempotency key for one firing. Buckets to the matching HOUR so the
 * repeated ~15-min ticks inside the scheduled hour collapse to a single run,
 * while distinct days/hours get distinct keys. `cron` is accepted for future
 * finer-grained cadences; today all report crons fire at most once per hour.
 */
export function reportIdempotencyKey(reportType: string, _cron: ParsedCron, parts: ZonedParts): string {
  const y = parts.year;
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  const h = String(parts.hour).padStart(2, "0");
  return `report:${reportType}:${y}${m}${d}${h}`;
}

export interface ReportDueState {
  enabled: boolean;
  schedule: string;
  lastIdempotencyKey: string | null;
  lock: JobLockState;
}

export interface ReportDueDecision {
  shouldRun: boolean;
  idempotencyKey?: string;
  skipReason?: "disabled" | "not_scheduled" | "bad_schedule" | "locked" | "duplicate";
}

/**
 * Should a report run now, given its schedule, timezone, lock, and last firing?
 * Combines the cron/timezone match with the base lock + idempotency rules. Pure.
 */
export function isReportDue(
  reportType: string,
  state: ReportDueState,
  timeZone: string,
  now: Date = new Date(),
): ReportDueDecision {
  if (!state.enabled) return { shouldRun: false, skipReason: "disabled" };
  const cron = parseCron(state.schedule);
  if (!cron) return { shouldRun: false, skipReason: "bad_schedule" };

  const parts = zonedParts(now, timeZone);
  if (!cronMatchesHour(cron, parts)) return { shouldRun: false, skipReason: "not_scheduled" };

  const idempotencyKey = reportIdempotencyKey(reportType, cron, parts);
  const base = evaluateDue(
    { enabled: state.enabled, lastIdempotencyKey: state.lastIdempotencyKey, lock: state.lock },
    idempotencyKey,
    now,
  );
  if (!base.shouldRun) {
    return {
      shouldRun: false,
      idempotencyKey,
      skipReason: base.skipReason === "locked" ? "locked" : "duplicate",
    };
  }
  return { shouldRun: true, idempotencyKey };
}
