/**
 * Scheduler foundation — the pure locking / idempotency / retry logic.
 *
 * Ghost.ma is serverless (Vercel), so there is no permanently running process:
 * scheduled AI work is driven by a cron route that asks "which jobs are due?"
 * and claims each with a DB lock so two overlapping invocations (or two
 * deployments) cannot run the same job at once. This file holds the pure
 * decision helpers; the DB-backed claim/release lives in
 * src/lib/ai-ops/jobStore.ts and the cron entry point in
 * src/app/api/cron/ai-ops/route.ts.
 *
 * The design mirrors the existing ops layer: withJobRun/ScheduledJobRun track
 * infra crons; AiScheduledJob adds the admin-configurable jobs with an explicit
 * lock (lockedAt/lockExpiresAt/lockedBy) and an idempotency key.
 */

import type { JobStatus } from "./types";

/** Default lock lease. A crashed run's lock expires after this and is reclaimable. */
export const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

export interface JobLockState {
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
}

/**
 * Is a job currently locked by a live holder at `now`? A lock whose lease has
 * expired is NOT held — it may be reclaimed. Pure.
 */
export function isLockHeld(
  state: JobLockState,
  now: Date = new Date(),
): boolean {
  if (!state.lockedAt) return false;
  if (!state.lockExpiresAt) return true; // locked with no lease: treat as held
  return now.getTime() < state.lockExpiresAt.getTime();
}

/**
 * Can this invocation claim the lock? True when no live lock is held. Pure —
 * the actual atomic claim is a conditional UPDATE in the store, this predicate
 * documents and tests the rule.
 */
export function canClaimLock(
  state: JobLockState,
  now: Date = new Date(),
): boolean {
  return !isLockHeld(state, now);
}

export interface JobRunState {
  enabled: boolean;
  lastIdempotencyKey: string | null;
  lock: JobLockState;
}

export type SkipReason = "disabled" | "locked" | "duplicate";

export interface DueDecision {
  shouldRun: boolean;
  skipReason?: SkipReason;
}

/**
 * Should a job run now, for a computed `idempotencyKey`?
 *
 * Skips when the job is disabled, when a live lock is held, or when this exact
 * idempotency key was already the last one processed (the duplicate guard that
 * protects against double scheduled execution across deployments). Pure.
 */
export function evaluateDue(
  state: JobRunState,
  idempotencyKey: string,
  now: Date = new Date(),
): DueDecision {
  if (!state.enabled) return { shouldRun: false, skipReason: "disabled" };
  if (isLockHeld(state.lock, now)) return { shouldRun: false, skipReason: "locked" };
  if (state.lastIdempotencyKey && state.lastIdempotencyKey === idempotencyKey) {
    return { shouldRun: false, skipReason: "duplicate" };
  }
  return { shouldRun: true };
}

/**
 * Has this job exhausted its retry budget? `consecutiveFailures` is compared to
 * `maxRetries` (the number of RETRIES allowed after the first attempt), so the
 * job gives up once it has failed `maxRetries + 1` times in a row. Pure.
 */
export function retriesExhausted(
  consecutiveFailures: number,
  maxRetries: number,
): boolean {
  return consecutiveFailures > Math.max(0, maxRetries);
}

/**
 * A stable idempotency key for a scheduled run: the job key plus a bucket
 * derived from the cadence. Daily jobs bucket by calendar day, so every
 * invocation within the same day computes the same key and only the first runs.
 * Pure — the timestamp is passed in (Date is not read from the ambient clock in
 * a way that would defeat the duplicate guard).
 */
export function scheduledIdempotencyKey(
  jobKey: string,
  bucket: "day" | "hour" | "week",
  at: Date,
): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  if (bucket === "hour") {
    const h = String(at.getUTCHours()).padStart(2, "0");
    return `${jobKey}:${y}${m}${d}${h}`;
  }
  if (bucket === "week") {
    // ISO-ish week bucket: year + week number (UTC).
    const week = isoWeek(at);
    return `${jobKey}:${y}W${String(week).padStart(2, "0")}`;
  }
  return `${jobKey}:${y}${m}${d}`;
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export type { JobStatus };
