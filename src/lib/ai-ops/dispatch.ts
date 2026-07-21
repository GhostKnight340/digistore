/**
 * The scheduled-AI-job dispatcher (spec §8).
 *
 * Invoked by the /api/cron/ai-ops route every 15 minutes. It asks jobStore which
 * jobs are due (enabled, unlocked, not a duplicate for the current time bucket),
 * then for each one CLAIMS THE LOCK (the real cross-deployment mutex) and runs
 * the module through the guarded runner, releasing the lock with the outcome.
 * Idempotency + locking mean two overlapping cron invocations, or two
 * deployments firing at once, cannot double-run a job.
 *
 * Also opportunistically expires stale approvals so the queue self-cleans.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import { dueJobs, claimJobLock, releaseJobLock } from "./jobStore";
import { runModule } from "./runner";
import { expireStaleApprovals } from "./approvalStore";
import { scheduledIdempotencyKey } from "./scheduler";
import { MODULE_DEFINITIONS, isModuleKey } from "./types";

/** Chooses the idempotency time-bucket for a job from its module's cadence. */
function bucketForJob(jobKey: string): "day" | "hour" | "week" {
  const module = isModuleKey(jobKey) ? MODULE_DEFINITIONS[jobKey] : null;
  const schedule = module?.defaultSchedule ?? "";
  if (/\*\/\d+\s/.test(schedule) || /^\d+\s\*\/\d+/.test(schedule)) return "hour";
  // A day-of-week field that isn't "*" implies a weekly cadence.
  const dow = schedule.trim().split(/\s+/)[4];
  if (dow && dow !== "*") return "week";
  return "day";
}

export interface DispatchResult {
  considered: number;
  ran: number;
  skipped: number;
  expiredApprovals: number;
}

/**
 * Runs one dispatch pass. A unique `runnerId` distinguishes this invocation for
 * the lock's `lockedBy`. Never throws — per-job failures are recorded and the
 * pass continues.
 */
export async function dispatchDueAiJobs(runnerId: string, now = new Date()): Promise<DispatchResult> {
  const idempotencyKeyFor = (jobKey: string, at: Date) =>
    scheduledIdempotencyKey(jobKey, bucketForJob(jobKey), at);

  const due = await dueJobs(idempotencyKeyFor, now);
  let ran = 0;
  let skipped = 0;

  for (const job of due) {
    // daily_reports is scheduled per-report by reportDispatch, never the base
    // scheduler — skip any legacy AiScheduledJob row for it so it never
    // double-runs the placeholder.
    if (job.key === "daily_reports" || job.module === "daily_reports") {
      skipped += 1;
      continue;
    }
    // Claim the lock — only one invocation wins; a lost claim means someone else
    // is already running it, so we skip.
    const token = await claimJobLock(job.key, runnerId, now);
    if (!token) {
      skipped += 1;
      continue;
    }
    try {
      const result = job.module
        ? await runModule({ module: job.module, trigger: "schedule", idempotencyKey: job.idempotencyKey })
        : { ok: false as const, reason: "no_module" };
      await releaseJobLock(job.key, {
        success: result.ok,
        error: result.ok ? undefined : result.reason,
        idempotencyKey: job.idempotencyKey,
      });
      if (result.ok) ran += 1;
      else skipped += 1;
    } catch (error) {
      await releaseJobLock(job.key, {
        success: false,
        error: error instanceof Error ? error.message : "dispatch_failed",
      });
      skipped += 1;
    }
  }

  const expiredApprovals = await expireStaleApprovals(now).catch(() => 0);

  log.info("ai dispatch pass", {
    operation: "ai.dispatch",
    result: "ok",
    considered: due.length,
    ran,
    skipped,
  });

  return { considered: due.length, ran, skipped, expiredApprovals };
}
