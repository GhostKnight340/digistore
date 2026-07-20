import { handleCronRequest } from "@/lib/ops/cronRoute";
import { checkStuckOrders } from "@/lib/ops/stuckOrders";

/**
 * Stuck-order sweep (Vercel Cron — see vercel.json).
 *
 * Closes the most serious observability gap in the shop: nothing watched for an
 * order that was PAID and never delivered. The dashboard counted a review
 * backlog, but only for someone who happened to open it, and there was no
 * detector at all for `payment_confirmed` — the state where the money is taken
 * and the customer has nothing.
 *
 * ALERTS ONLY. It never cancels, refunds or advances an order: the existing
 * system has no safe automatic transition rules, and inventing them on a timer
 * would risk touching real money unattended. A human decides; this makes sure a
 * human knows.
 *
 * Read-only against the database apart from the alert-cooldown bookkeeping.
 *
 * Auth: same contract as every other cron — Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`. Fails closed if the secret is unset.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCronRequest("stuck-orders", request, async () => {
    const { groups, alerted } = await checkStuckOrders();
    return {
      alerted,
      groups: groups.map((g) => ({ status: g.status, count: g.count })),
    };
  });
}

export const GET = handle;
export const POST = handle;
