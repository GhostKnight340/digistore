import { NextResponse } from "next/server";
import { runWalletExpiryAndReminders } from "@/lib/db/walletExpiryJob";

/**
 * Daily Ghost Credit maintenance (Vercel Cron — see vercel.json). Expires wallets
 * past their 180-day inactivity deadline and sends the "3 days before" expiry
 * reminder to opted-in customers. Both steps are idempotent (per-deadline
 * expiration key + per-cycle reminder anchor), so a re-run never double-expires
 * or double-emails.
 *
 * Auth: same contract as the other crons — Vercel Cron sends
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
    const result = await runWalletExpiryAndReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:ghost-credit]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
