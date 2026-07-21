/**
 * Daily Reports dispatcher — the scheduled side (spec: reuse the AI Operations
 * scheduler).
 *
 * Invoked from the same /api/cron/ai-ops route as dispatchDueAiJobs, on the same
 * ~15-minute cadence. For each report it evaluates the pure cron+timezone due
 * rule, claims the cross-deployment lock, generates + delivers the report
 * through the guarded module, and releases the lock with the outcome. A failed
 * delivery leaves the idempotency key unadvanced, so the next pass retries until
 * the report's `maxRetries` budget is spent.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import { getAiOpsSettings } from "../store";
import { retriesExhausted } from "../scheduler";
import { isReportDue } from "./reportSchedule";
import { listReportSchedules, claimReportLock, releaseReportLock } from "./reportStore";
import { generateReport } from "../modules/dailyReports";

export interface ReportDispatchResult {
  considered: number;
  ran: number;
  skipped: number;
}

/**
 * Runs one report-dispatch pass. `runnerId` distinguishes this invocation for
 * the lock's `lockedBy`. Never throws — per-report failures are recorded and the
 * pass continues.
 */
export async function dispatchDueReports(runnerId: string, now = new Date()): Promise<ReportDispatchResult> {
  const settings = await getAiOpsSettings();
  const schedules = await listReportSchedules();
  let ran = 0;
  let skipped = 0;
  let considered = 0;

  for (const schedule of schedules) {
    if (retriesExhausted(schedule.consecutiveFailures, schedule.maxRetries)) continue;
    const timezone = schedule.timezone ?? settings.timezone;
    const decision = isReportDue(
      schedule.reportType,
      {
        enabled: schedule.enabled,
        schedule: schedule.schedule,
        lastIdempotencyKey: schedule.lastIdempotencyKey,
        lock: { lockedAt: schedule.lockedAt, lockExpiresAt: schedule.lockExpiresAt },
      },
      timezone,
      now,
    );
    if (!decision.shouldRun || !decision.idempotencyKey) continue;
    considered += 1;

    const token = await claimReportLock(schedule.reportType, runnerId, now);
    if (!token) {
      skipped += 1;
      continue;
    }
    try {
      const result = await generateReport({
        reportType: schedule.reportType,
        trigger: "schedule",
        deliver: true,
        idempotencyKey: decision.idempotencyKey,
        modelOverride: schedule.modelOverride,
        maxTokens: schedule.maxTokens,
        discordChannelId: schedule.discordChannelId,
      });
      await releaseReportLock(schedule.reportType, {
        success: result.ok,
        error: result.ok ? undefined : result.reason,
        idempotencyKey: decision.idempotencyKey,
      });
      if (result.ok) ran += 1;
      else skipped += 1;
    } catch (error) {
      await releaseReportLock(schedule.reportType, {
        success: false,
        error: error instanceof Error ? error.message : "dispatch_failed",
      });
      skipped += 1;
    }
  }

  log.info("daily reports dispatch pass", {
    operation: "ai.daily_reports.dispatch",
    result: "ok",
    considered,
    ran,
    skipped,
  });
  return { considered, ran, skipped };
}
