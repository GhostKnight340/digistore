import { handleCronRequest } from "@/lib/ops/cronRoute";
import { runSupplierReconciliation } from "@/lib/db/supplierJobs";

/**
 * Supplier order reconciliation (Vercel Cron — see vercel.json).
 *
 * Resolves fulfillment slots whose outcome is not yet definitive: orders still
 * processing at the supplier, and — critically — orders whose result we never
 * learned because a request timed out or the process died mid-purchase. Each
 * pass asks the supplier what actually happened, delivers anything that
 * completed, and escalates whatever automated resolution cannot settle.
 *
 * Idempotent by construction: all state lives in the SupplierFulfillment ledger,
 * every transition is a guarded write, and delivery is gated on a unique index.
 * An overlapping run therefore cannot double-deliver or double-purchase — the
 * second run simply finds the slots already resolved.
 *
 * This job NEVER places a new order and never mints a new idempotency key.
 *
 * Auth: same contract as the other crons — Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`. Fails closed if the secret is unset.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("supplier-reconcile", request, () => runSupplierReconciliation());
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
