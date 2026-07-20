import { handleCronRequest } from "@/lib/ops/cronRoute";
import { runExpenseCron } from "@/lib/expenses/reminders";

/**
 * Daily expense tick (Vercel Cron — see vercel.json). Marks overdue entries,
 * emits due/overdue reminders, and posts the monthly summary on the configured
 * day. Idempotent (guarded by ExpenseNotificationLog.dedupeKey) so a re-run
 * never double-posts.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
 * CRON_SECRET env var is set. Fails closed if the secret is unset or mismatched.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("expenses", request, () => runExpenseCron());
}

export const GET = handle;
export const POST = handle;
