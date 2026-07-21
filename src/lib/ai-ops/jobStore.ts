/**
 * Scheduled-job persistence + the cross-deployment execution lock (spec §8).
 *
 * Serverless-safe: there is no long-running process, so a cron route asks
 * `dueJobs()` which jobs to run and claims each with `claimJobLock` — an ATOMIC
 * conditional UPDATE that only one invocation can win, so two overlapping
 * serverless executions (or two deployments) cannot run the same job at once.
 * The pure lock/idempotency rules live in src/lib/ai-ops/scheduler.ts.
 *
 * Distinct from ScheduledJobRun (infra crons via withJobRun): these are the
 * admin-configurable AI jobs with enable/disable, run-now, retry limits, and the
 * lock.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/ops/log";
import { MODULE_DEFINITIONS, MODULE_KEYS, type ModuleKey } from "./types";
import { DEFAULT_LOCK_TTL_MS, evaluateDue, retriesExhausted } from "./scheduler";

/** Ensures a job row exists for every scheduled module. Idempotent. */
export async function ensureJobsSeeded(): Promise<void> {
  for (const key of MODULE_KEYS) {
    const def = MODULE_DEFINITIONS[key];
    if (!def.scheduled) continue;
    const existing = await prisma.aiScheduledJob.findUnique({ where: { key } });
    if (!existing) {
      await prisma.aiScheduledJob.create({
        data: { key, module: key, enabled: true, schedule: def.defaultSchedule },
      });
    }
  }
}

export async function listJobs() {
  await ensureJobsSeeded();
  return prisma.aiScheduledJob.findMany({ orderBy: { key: "asc" } });
}

export async function setJobEnabled(key: string, enabled: boolean): Promise<void> {
  await prisma.aiScheduledJob.update({ where: { key }, data: { enabled } });
}

/**
 * Atomically claims the execution lock for `key`, if free. Returns a token on
 * success or null when another invocation holds a live lock.
 *
 * The atomicity comes from the WHERE clause: the UPDATE only matches rows whose
 * lock is null OR expired, so a concurrent claimant's UPDATE matches zero rows.
 * (Postgres row locking under updateMany makes this a genuine mutex.)
 */
export async function claimJobLock(
  key: string,
  lockedBy: string,
  now = new Date(),
  ttlMs = DEFAULT_LOCK_TTL_MS,
): Promise<string | null> {
  const lockExpiresAt = new Date(now.getTime() + ttlMs);
  const result = await prisma.aiScheduledJob.updateMany({
    where: {
      key,
      OR: [{ lockedAt: null }, { lockExpiresAt: { lte: now } }],
    },
    data: { lockedAt: now, lockExpiresAt, lockedBy, status: "running", lastRunAt: now },
  });
  if (result.count === 0) return null;
  return lockedBy;
}

/** Releases the lock and records the run outcome. */
export async function releaseJobLock(
  key: string,
  outcome: { success: boolean; error?: string; idempotencyKey?: string },
): Promise<void> {
  const now = new Date();
  if (outcome.success) {
    await prisma.aiScheduledJob.update({
      where: { key },
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
    await prisma.aiScheduledJob.update({
      where: { key },
      data: {
        lockedAt: null,
        lockExpiresAt: null,
        lockedBy: null,
        status: "failure",
        lastFailureAt: now,
        lastError: outcome.error?.slice(0, 200) ?? "job_failed",
        consecutiveFailures: { increment: 1 },
      },
    });
  }
  log.info("ai job released", {
    operation: `ai.job.${key}`,
    result: outcome.success ? "success" : "failure",
  });
}

export interface DueJob {
  key: string;
  module: string | null;
  idempotencyKey: string;
}

/**
 * Returns the jobs eligible to run now, each with its computed idempotency key.
 * Applies the pure `evaluateDue` rules (enabled, not locked, not a duplicate)
 * and the retry ceiling. Callers then attempt `claimJobLock` per job — the lock
 * is the real mutex; this is the cheap pre-filter.
 */
export async function dueJobs(
  idempotencyKeyFor: (key: string, now: Date) => string,
  now = new Date(),
): Promise<DueJob[]> {
  await ensureJobsSeeded();
  const jobs = await prisma.aiScheduledJob.findMany();
  const out: DueJob[] = [];
  for (const job of jobs) {
    if (retriesExhausted(job.consecutiveFailures, job.maxRetries)) continue;
    const idempotencyKey = idempotencyKeyFor(job.key, now);
    const decision = evaluateDue(
      {
        enabled: job.enabled,
        lastIdempotencyKey: job.lastIdempotencyKey,
        lock: { lockedAt: job.lockedAt, lockExpiresAt: job.lockExpiresAt },
      },
      idempotencyKey,
      now,
    );
    if (decision.shouldRun) out.push({ key: job.key, module: job.module, idempotencyKey });
  }
  return out;
}

export type { ModuleKey };
