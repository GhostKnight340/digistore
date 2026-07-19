import { NextResponse } from "next/server";
import { runSupplierHealthRefresh } from "@/lib/db/supplierJobs";

/**
 * Supplier account/subscription/balance refresh (Vercel Cron — see vercel.json).
 *
 * Keeps the Operations Dashboard honest: without this, a supplier's health is
 * only as fresh as the last time an admin clicked "Tester la connexion", so an
 * expired subscription or a drained wallet would first surface as a failed
 * customer order rather than as an alert.
 *
 * Read-only — probes `/me` and `/balance`, never orders. Disabled and
 * unconfigured suppliers are skipped rather than probed, so turning a supplier
 * off does not generate a stream of auth failures.
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
    const result = await runSupplierHealthRefresh();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron:supplier-health]", error instanceof Error ? error.message : error);
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
