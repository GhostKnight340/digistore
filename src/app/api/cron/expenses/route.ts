import { NextResponse } from "next/server";
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
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runExpenseCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:expenses]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
