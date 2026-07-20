import "server-only";

import { prisma } from "@/lib/db/prisma";
import { publicOrderReference } from "@/lib/db/orders";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { notifySystemAlert } from "@/lib/discord/notify";
import { claimAlertSlot } from "./alertCooldown";
import { log } from "./log";

/**
 * Stuck-order detection.
 *
 * The gap this closes is the worst one in the operations audit: **nothing
 * watched for a customer who paid and received nothing.** `waitingTooLong` in
 * ops/metrics counted `payment_submitted` orders past SLA, but only as a card on
 * a dashboard someone has to open — no push, no alert. And there was no detector
 * at all for `payment_confirmed`, the state where the money is taken and the
 * goods are not delivered. The `order_stuck` alert key existed and was never
 * fired from anywhere.
 *
 * This ALERTS ONLY. It never cancels, refunds, or advances an order: the
 * existing system has no safe automatic transition rules, and inventing them
 * here would risk touching real money on a timer.
 */

/**
 * How long an order may sit in each transitional status before it needs a human.
 * Overridable per-deployment; the defaults are deliberately conservative so the
 * first alert is a real problem rather than normal latency.
 */
export const STUCK_THRESHOLDS_HOURS = {
  /** Customer said they paid; an admin must review the proof. */
  payment_submitted: envHours("OPS_STUCK_PAYMENT_SUBMITTED_HOURS", 12),
  /**
   * Payment CONFIRMED but nothing delivered. The money is ours and the customer
   * has nothing — the shortest threshold by a wide margin.
   */
  payment_confirmed: envHours("OPS_STUCK_PAYMENT_CONFIRMED_HOURS", 2),
  /** Flagged as a problem and then forgotten. */
  payment_issue: envHours("OPS_STUCK_PAYMENT_ISSUE_HOURS", 24),
} as const;

export type StuckStatus = keyof typeof STUCK_THRESHOLDS_HOURS;

function envHours(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export interface StuckOrderGroup {
  status: StuckStatus;
  thresholdHours: number;
  count: number;
  /** Public references only — never internal ids, names or e-mails. */
  samples: { ref: string; ageHours: number; adminUrl: string }[];
}

/**
 * Finds orders sitting too long in a transitional status.
 *
 * Age is measured from `updatedAt`, not `createdAt`: an order that entered
 * `payment_confirmed` five minutes ago is not stuck just because it was placed
 * three days ago. `createdAt` would have made every old order look stuck the
 * moment it was confirmed.
 */
export async function findStuckOrders(now: Date = new Date()): Promise<StuckOrderGroup[]> {
  const groups: StuckOrderGroup[] = [];

  for (const status of Object.keys(STUCK_THRESHOLDS_HOURS) as StuckStatus[]) {
    const thresholdHours = STUCK_THRESHOLDS_HOURS[status];
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000);
    const rows = await prisma.order.findMany({
      where: { status, updatedAt: { lt: cutoff } },
      orderBy: { updatedAt: "asc" },
      take: 5,
      select: { id: true, createdAt: true, updatedAt: true },
    });
    if (rows.length === 0) continue;

    const count = await prisma.order.count({
      where: { status, updatedAt: { lt: cutoff } },
    });

    const samples = await Promise.all(
      rows.map(async (row) => {
        const reference = await publicOrderReference(row);
        return {
          ref: reference.number,
          ageHours: Math.floor((now.getTime() - row.updatedAt.getTime()) / 3_600_000),
          // Links by INTERNAL id because this is the admin surface and the admin
          // is already authorized. Nothing here reaches a customer.
          adminUrl: absoluteAppUrl(`/admin/orders/${row.id}`),
        };
      }),
    );

    groups.push({ status, thresholdHours, count, samples });
  }

  return groups;
}

const STATUS_LABEL: Record<StuckStatus, string> = {
  payment_submitted: "Justificatif en attente de vérification",
  payment_confirmed: "Payée mais non livrée",
  payment_issue: "Problème de paiement non résolu",
};

/**
 * Runs the detector and alerts per status group.
 *
 * Cooldown is keyed per STATUS rather than per order: one message saying "4
 * orders paid but undelivered" is actionable, whereas four messages an hour
 * about the same backlog is how a channel gets muted.
 */
export async function checkStuckOrders(now: Date = new Date()): Promise<{
  groups: StuckOrderGroup[];
  alerted: number;
}> {
  const groups = await findStuckOrders(now);
  let alerted = 0;

  for (const group of groups) {
    // Paid-but-undelivered is the one where a customer is actively out of
    // pocket, so it re-alerts far more often than a review backlog.
    const severity = group.status === "payment_confirmed" ? "critical" : "warning";
    const cooldownMs = (group.status === "payment_confirmed" ? 30 : 120) * 60_000;

    const slot = await claimAlertSlot(`order_stuck:${group.status}`, severity, cooldownMs);
    if (!slot.shouldSend) continue;

    const lines = group.samples
      .map((s) => `• ${s.ref} — ${s.ageHours} h — ${s.adminUrl}`)
      .join("\n");
    const more = group.count > group.samples.length
      ? `\n…et ${group.count - group.samples.length} autre(s).`
      : "";

    await notifySystemAlert({
      scope: `orders:${group.status}`,
      message:
        `**${STATUS_LABEL[group.status]}**\n` +
        `${group.count} commande(s) bloquée(s) depuis plus de ${group.thresholdHours} h.\n${lines}${more}`,
      context: {
        severity,
        alert: "order_stuck",
        status: group.status,
        count: group.count,
        threshold_hours: group.thresholdHours,
      },
    });
    alerted += 1;
  }

  log.info("stuck order sweep", {
    operation: "ops.stuck_orders",
    result: "ok",
    groups: groups.length,
    alerted,
  });

  return { groups, alerted };
}
