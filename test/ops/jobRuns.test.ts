/**
 * Scheduled-job staleness.
 *
 * The rule this pins is the one the dashboard used to get wrong in both
 * directions: `getJobsStatus` reported a green light purely because the
 * deployment was on Vercel (a status nobody earned), while `checkCron` in the
 * same dashboard reported "unknown". Health must follow recorded executions, and
 * "never succeeded" must never read as healthy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CRON_JOBS, JOB_MAX_AGE_MS, isJobOverdue } from "../../src/lib/ops/jobRuns";

const NOW = new Date("2026-07-19T12:00:00.000Z");

test("a job that has never succeeded is always overdue", () => {
  // The important direction: absence of evidence is not evidence of health.
  for (const job of CRON_JOBS) {
    assert.equal(isJobOverdue(job, null, NOW), true, `${job} must be overdue when never run`);
  }
});

test("a recent success is not overdue", () => {
  for (const job of CRON_JOBS) {
    const recent = new Date(NOW.getTime() - 60_000);
    assert.equal(isJobOverdue(job, recent, NOW), false, `${job} ran a minute ago`);
  }
});

test("each job goes overdue just past its own max age", () => {
  for (const job of CRON_JOBS) {
    const maxAge = JOB_MAX_AGE_MS[job];
    const justInside = new Date(NOW.getTime() - (maxAge - 60_000));
    const justOutside = new Date(NOW.getTime() - (maxAge + 60_000));
    assert.equal(isJobOverdue(job, justInside, NOW), false, `${job} inside window`);
    assert.equal(isJobOverdue(job, justOutside, NOW), true, `${job} outside window`);
  }
});

test("thresholds are generous enough that one skipped run is not an alert", () => {
  // A 10-minute job must tolerate a missed tick; paging on every blip is how a
  // channel gets muted. Each threshold is several times its interval.
  assert.ok(JOB_MAX_AGE_MS["supplier-reconcile"] >= 30 * 60_000);
  assert.ok(JOB_MAX_AGE_MS.expenses >= 24 * 60 * 60_000);
  assert.ok(JOB_MAX_AGE_MS["expense-review"] >= 31 * 24 * 60 * 60_000);
});

test("every declared cron job has a staleness threshold", () => {
  // A job added to CRON_JOBS without a threshold would crash at runtime.
  for (const job of CRON_JOBS) {
    assert.equal(typeof JOB_MAX_AGE_MS[job], "number", `${job} missing a threshold`);
    assert.ok(JOB_MAX_AGE_MS[job] > 0);
  }
});
