import { handleCronRequest } from "@/lib/ops/cronRoute";
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
  return handleCronRequest("ghost-credit", request, () => runWalletExpiryAndReminders());
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
