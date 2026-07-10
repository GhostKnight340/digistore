import { NextResponse } from "next/server";
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
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runMonthlyReview();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:expense-review]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
