import "server-only";

import { prisma } from "@/lib/db/prisma";
import { notifySystemAlert } from "@/lib/discord/notify";
import { claimAlertSlot } from "./alertCooldown";
import { log } from "./log";

/**
 * Scheduled-job execution tracking and failure alerting.
 *
 * Two gaps this closes, both of which made a broken cron invisible:
 *
 *  1. **Nothing recorded that a job ran.** `checkCron` could only report
 *     "unknown" — a job broken for a week looked identical to a healthy one.
 *     Meanwhile `getJobsStatus` reported a green light purely because the
 *     deployment was on Vercel, which is a status nobody earned.
 *
 *  2. **Nothing alerted when a job threw.** All five handlers caught, wrote
 *     `console.error`, and returned a 500. A cron failing on every invocation
 *     produced no Discord message, no Sentry event, and no persisted trace.
 *
 * Wrap a handler in {@link withJobRun} and both are handled.
 */

/** The job names, matching the cron paths in vercel.json. */
export const CRON_JOBS = [
  "expenses",
  "expense-review",
  "ghost-credit",
  "supplier-reconcile",
  "supplier-health",
  "stuck-orders",
  "ai-ops",
] as const;

export type CronJob = (typeof CRON_JOBS)[number];

/**
 * How long after its last success a job is considered overdue. Deliberately
 * generous — several times the schedule interval — so a single skipped run does
 * not page anyone, but a genuinely dead schedule surfaces.
 */
export const JOB_MAX_AGE_MS: Record<CronJob, number> = {
  expenses: 36 * 60 * 60 * 1000, // daily
  "expense-review": 40 * 24 * 60 * 60 * 1000, // monthly
  "ghost-credit": 36 * 60 * 60 * 1000, // daily
  "supplier-reconcile": 60 * 60 * 1000, // every 10 min
  "supplier-health": 8 * 60 * 60 * 1000, // every 2 h
  "stuck-orders": 4 * 60 * 60 * 1000, // hourly
  "ai-ops": 90 * 60 * 1000, // every 15 min dispatcher; overdue after 90 min
};

/** Alert after this many consecutive failures. The first failure may be a blip. */
const FAILURE_ALERT_THRESHOLD = 2;
const FAILURE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Runs a scheduled job, recording its outcome and alerting on repeated failure.
 *
 * The bookkeeping is best-effort in both directions: a failure to RECORD the run
 * must not fail the job, and a failure of the job must still be recorded. The
 * job's own result (or thrown error) is always what propagates to the caller.
 */
export async function withJobRun<T>(job: CronJob, run: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  await safely(() =>
    prisma.scheduledJobRun.upsert({
      where: { job },
      create: { job, startedAt, status: "running" },
      update: { startedAt, status: "running" },
    }),
  );

  try {
    const result = await run();
    const durationMs = Date.now() - startedAt.getTime();
    await safely(() =>
      prisma.scheduledJobRun.update({
        where: { job },
        data: {
          status: "success",
          lastSuccessAt: new Date(),
          durationMs,
          lastError: null,
          // Reset on success: the counter measures a CURRENT outage, not a
          // lifetime total.
          consecutiveFailures: 0,
        },
      }),
    );
    log.info("scheduled job completed", { operation: `cron.${job}`, result: "ok", durationMs });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt.getTime();
    const failures = await recordFailure(job, error, durationMs);
    log.exception(error, { operation: `cron.${job}`, result: "failed", consecutiveFailures: failures });
    if (failures >= FAILURE_ALERT_THRESHOLD) await alertJobFailure(job, failures);
    throw error;
  }
}

async function recordFailure(job: CronJob, error: unknown, durationMs: number): Promise<number> {
  const message = error instanceof Error ? error.message : String(error);
  const updated = await safely(() =>
    prisma.scheduledJobRun.update({
      where: { job },
      data: {
        status: "failure",
        lastFailureAt: new Date(),
        durationMs,
        // Truncated and sanitized: a supplier SDK can put a whole response body
        // in the message, and that body is where a delivered code lives.
        lastError: message.slice(0, 200),
        consecutiveFailures: { increment: 1 },
      },
      select: { consecutiveFailures: true },
    }),
  );
  // If we could not record it, assume the threshold is met so the alert still
  // goes out — an unrecordable failure is not a reason to stay quiet.
  return updated?.consecutiveFailures ?? FAILURE_ALERT_THRESHOLD;
}

async function alertJobFailure(job: CronJob, failures: number): Promise<void> {
  const slot = await claimAlertSlot(
    `cron:${job}:failed`,
    "critical",
    FAILURE_ALERT_COOLDOWN_MS,
  );
  if (!slot.shouldSend) return;
  await safely(() =>
    notifySystemAlert({
      scope: `cron:${job}`,
      message: `**Tâche planifiée en échec**\nLa tâche \`${job}\` a échoué ${failures} fois de suite.`,
      context: { severity: "critical", job, consecutive_failures: failures },
    }),
  );
}

/** A job's recorded state, or null when it has never run. */
export async function getJobRuns() {
  try {
    return await prisma.scheduledJobRun.findMany({ orderBy: { job: "asc" } });
  } catch {
    return [];
  }
}

/**
 * Is this job overdue relative to its schedule? Pure, so the staleness rule is
 * testable without a database.
 *
 * A job that has never succeeded is overdue as soon as it is known — "never
 * succeeded" must never read as healthy.
 */
export function isJobOverdue(
  job: CronJob,
  lastSuccessAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastSuccessAt) return true;
  return now.getTime() - lastSuccessAt.getTime() > JOB_MAX_AGE_MS[job];
}

/** Swallows bookkeeping errors — observability must never break the observed. */
async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
