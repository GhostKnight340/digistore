import { randomUUID } from "node:crypto";
import { handleCronRequest } from "@/lib/ops/cronRoute";
import { dispatchDueAiJobs } from "@/lib/ai-ops/dispatch";
import { dispatchDueReports } from "@/lib/ai-ops/reports/reportDispatch";

/**
 * AI Operations scheduled-job dispatcher (Vercel Cron — see vercel.json,
 * every 15 minutes).
 *
 * Serverless-safe scheduling: this route does not assume a long-running process.
 * Each invocation asks which AI jobs are due and claims each with a DB lock, so
 * two overlapping invocations (or two deployments) cannot double-run a job. All
 * business rules — global kill switch, per-module enablement, budgets — are
 * enforced inside the runner, so a run that shouldn't happen simply doesn't.
 *
 * Auth: identical contract to the other crons via handleCronRequest —
 * `Authorization: Bearer ${CRON_SECRET}`, and it fails CLOSED (503) if the
 * secret is unset. Outcomes are recorded and alerted through withJobRun.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("ai-ops", request, async () => {
    const runnerId = `cron-${randomUUID()}`;
    // Base scheduled modules + the four executive reports share this pass.
    const [jobs, reports] = await Promise.all([
      dispatchDueAiJobs(runnerId),
      dispatchDueReports(runnerId),
    ]);
    return { ...jobs, reports };
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
