import "server-only";

import { NextResponse } from "next/server";
import { withJobRun, type CronJob } from "./jobRuns";
import { log } from "./log";

/**
 * The shared cron route body: authorize, run, record, respond.
 *
 * All five cron handlers had an identical hand-copied auth block and an
 * identical catch that only wrote `console.error` — so a job failing on every
 * invocation produced no alert, no Sentry event and no trace. Centralising it
 * means the auth contract and the observability are fixed in one place and
 * cannot drift between routes.
 *
 * The auth behaviour is preserved EXACTLY, including the property that matters
 * most: a missing `CRON_SECRET` returns 503 rather than allowing the request.
 * Many implementations get this backwards (`if (secret && bad) reject`), which
 * silently opens the endpoint when the variable is unset.
 */
export async function handleCronRequest<T extends object>(
  job: CronJob,
  request: Request,
  run: () => Promise<T>,
): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    log.warn("cron request rejected", { operation: `cron.${job}`, result: "unauthorized" });
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    // withJobRun records the outcome and alerts on repeated failure.
    const result = await withJobRun(job, run);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Already logged, recorded and (past the threshold) alerted by withJobRun.
    // The response body stays deliberately generic: cron responses are visible
    // in Vercel's UI and a raw provider message can carry a secret.
    return NextResponse.json({ ok: false, error: "job_failed" }, { status: 500 });
  }
}
