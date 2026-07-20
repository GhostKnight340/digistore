import { handleCronRequest } from "@/lib/ops/cronRoute";
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
  return handleCronRequest("supplier-health", request, () => runSupplierHealthRefresh());
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
