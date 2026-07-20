import { handleCronRequest } from "@/lib/ops/cronRoute";
import { runMonthlyReview } from "@/lib/expenses/monthlyReviewJob";

/**
 * AUTOMATIC monthly expense review (Vercel Cron — see vercel.json,
 * "0 19 28-31 * *", ~20:00 in Africa/Casablanca). Vercel invokes this on days
 * 28–31; the handler posts ONLY on the actual last calendar day of the business
 * month (cron has no reliable "last day" syntax, so the gate lives here — this
 * also handles 28/29/30/31-day months and leap years). No admin action is ever
 * required for the monthly message to go out. The unique monthKey makes it
 * idempotent, so a re-run never double-posts and a previously failed month is
 * retried safely.
 *
 * Keep the cron's UTC hour aligned with expenses.monthlyReviewHour in the
 * business timezone; the handler will not send before that local hour.
 *
 * Auth: same contract as /api/cron/expenses — Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`. Fails closed if the secret is unset.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("expense-review", request, () => runMonthlyReview());
}

export const GET = handle;
export const POST = handle;
