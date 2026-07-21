/**
 * Daily Reports — schedule persistence + the cross-deployment execution lock.
 *
 * Serverless-safe, mirroring src/lib/ai-ops/jobStore.ts: the cron route asks
 * which reports are due and claims each with `claimReportLock` — an ATOMIC
 * conditional UPDATE only one invocation can win — so two overlapping serverless
 * executions cannot post the same report twice. The pure due/lock/idempotency
 * rules live in reportSchedule.ts and scheduler.ts.
 *
 * One AiReportSchedule row per report type, seeded from REPORT_DEFINITIONS.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/ops/log";
import { DEFAULT_LOCK_TTL_MS } from "../scheduler";
import { REPORT_TYPES, REPORT_DEFINITIONS, isReportType, type ReportType } from "./reportTypes";
import { nextFiringTime } from "./reportSchedule";

export interface ReportScheduleDTO {
  reportType: ReportType;
  enabled: boolean;
  schedule: string;
  timezone: string | null;
  discordChannelId: string | null;
  modelOverride: string | null;
  maxTokens: number | null;
  maxRetries: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  status: string;
  lastError: string | null;
  consecutiveFailures: number;
  lastIdempotencyKey: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
}

/** Ensures a schedule row exists for every report type. Idempotent. */
export async function ensureReportsSeeded(): Promise<void> {
  for (const type of REPORT_TYPES) {
    const existing = await prisma.aiReportSchedule.findUnique({ where: { reportType: type } });
    if (!existing) {
      await prisma.aiReportSchedule.create({
        data: { reportType: type, enabled: false, schedule: REPORT_DEFINITIONS[type].defaultSchedule },
      });
    }
  }
}

function toDTO(row: {
  reportType: string;
  enabled: boolean;
  schedule: string;
  timezone: string | null;
  discordChannelId: string | null;
  modelOverride: string | null;
  maxTokens: number | null;
  maxRetries: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  status: string;
  lastError: string | null;
  consecutiveFailures: number;
  lastIdempotencyKey: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
}): ReportScheduleDTO | null {
  if (!isReportType(row.reportType)) return null;
  return {
    reportType: row.reportType,
    enabled: row.enabled,
    schedule: row.schedule,
    timezone: row.timezone,
    discordChannelId: row.discordChannelId,
    modelOverride: row.modelOverride,
    maxTokens: row.maxTokens,
    maxRetries: row.maxRetries,
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    status: row.status,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    lastIdempotencyKey: row.lastIdempotencyKey,
    lockedAt: row.lockedAt,
    lockExpiresAt: row.lockExpiresAt,
  };
}

export async function listReportSchedules(): Promise<ReportScheduleDTO[]> {
  await ensureReportsSeeded();
  const rows = await prisma.aiReportSchedule.findMany({ orderBy: { reportType: "asc" } });
  return rows.map(toDTO).filter((r): r is ReportScheduleDTO => r !== null);
}

export async function getReportSchedule(type: string): Promise<ReportScheduleDTO | null> {
  if (!isReportType(type)) return null;
  await ensureReportsSeeded();
  const row = await prisma.aiReportSchedule.findUnique({ where: { reportType: type } });
  return row ? toDTO(row) : null;
}

export interface ReportScheduleUpdate {
  enabled?: boolean;
  schedule?: string;
  timezone?: string | null;
  discordChannelId?: string | null;
  modelOverride?: string | null;
  maxTokens?: number | null;
  maxRetries?: number;
}

export async function updateReportSchedule(
  type: string,
  patch: ReportScheduleUpdate,
): Promise<ReportScheduleDTO | null> {
  if (!isReportType(type)) return null;
  await ensureReportsSeeded();
  await prisma.aiReportSchedule.update({ where: { reportType: type }, data: patch });
  return getReportSchedule(type);
}

export async function setReportEnabled(type: string, enabled: boolean): Promise<void> {
  if (!isReportType(type)) return;
  await ensureReportsSeeded();
  await prisma.aiReportSchedule.update({ where: { reportType: type }, data: { enabled } });
}

/**
 * Atomically claims the execution lock for a report, if free. Returns a token on
 * success or null when another invocation holds a live lock. Atomicity comes
 * from the WHERE clause (only lock-null-or-expired rows match), exactly like
 * jobStore.claimJobLock.
 */
export async function claimReportLock(
  type: ReportType,
  lockedBy: string,
  now = new Date(),
  ttlMs = DEFAULT_LOCK_TTL_MS,
): Promise<string | null> {
  const lockExpiresAt = new Date(now.getTime() + ttlMs);
  const result = await prisma.aiReportSchedule.updateMany({
    where: { reportType: type, OR: [{ lockedAt: null }, { lockExpiresAt: { lte: now } }] },
    data: { lockedAt: now, lockExpiresAt, lockedBy, status: "running", lastRunAt: now },
  });
  return result.count === 0 ? null : lockedBy;
}

/** Releases the lock and records the run outcome (mirrors releaseJobLock). */
export async function releaseReportLock(
  type: ReportType,
  outcome: { success: boolean; error?: string; idempotencyKey?: string },
): Promise<void> {
  const now = new Date();
  if (outcome.success) {
    await prisma.aiReportSchedule.update({
      where: { reportType: type },
      data: {
        lockedAt: null,
        lockExpiresAt: null,
        lockedBy: null,
        status: "success",
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
        ...(outcome.idempotencyKey ? { lastIdempotencyKey: outcome.idempotencyKey } : {}),
      },
    });
  } else {
    await prisma.aiReportSchedule.update({
      where: { reportType: type },
      data: {
        lockedAt: null,
        lockExpiresAt: null,
        lockedBy: null,
        status: "failure",
        lastFailureAt: now,
        lastError: outcome.error?.slice(0, 200) ?? "report_failed",
        consecutiveFailures: { increment: 1 },
      },
    });
  }
  log.info("daily report released", {
    operation: `ai.daily_reports.${type}`,
    result: outcome.success ? "success" : "failure",
  });
}

/** The next scheduled firing for a report, in its effective timezone. */
export function nextRunAt(schedule: ReportScheduleDTO, defaultTimezone: string, now = new Date()): Date | null {
  return nextFiringTime(schedule.schedule, schedule.timezone ?? defaultTimezone, now);
}

export interface ReportExecutionDTO {
  id: string;
  trigger: string;
  status: string;
  startedAt: Date;
  durationMs: number | null;
  provider: string | null;
  model: string | null;
  estimatedCostUsd: number | null;
  summary: string | null;
  error: string | null;
}

/** Recent executions for the daily_reports module (all report types), newest first. */
export async function listReportExecutions(limit = 20): Promise<ReportExecutionDTO[]> {
  const rows = await prisma.aiExecution.findMany({
    where: { module: "daily_reports" },
    orderBy: { startedAt: "desc" },
    take: Math.min(50, Math.max(1, limit)),
    select: {
      id: true,
      trigger: true,
      status: true,
      startedAt: true,
      durationMs: true,
      provider: true,
      model: true,
      estimatedCostUsd: true,
      summary: true,
      error: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    estimatedCostUsd: r.estimatedCostUsd == null ? null : Number(r.estimatedCostUsd),
  }));
}
