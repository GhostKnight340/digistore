import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { grantCreditTx, debitCreditTx } from "./ghostCredit";
import { releaseOrderPromotion } from "./promoLifecycle";
import { getStoreSettings } from "./catalog";
import { PENDING_PAYMENT_STATUSES, isPendingPayment } from "@/lib/orderStatus";
import {
  orderSpendKey,
  orderExpiryReleaseKey,
  orderExpiryCreditExpiredKey,
} from "@/lib/promo/ledgerMath";

type Tx = Prisma.TransactionClient;

/**
 * Restore the Ghost Credit locked in an order, inside a transaction.
 *
 * The credit was debited at order creation (order_spend). On release we append a
 * NEW `order_refund_restore` credit (idempotent via order-expiry-credit-release:
 * {orderId}, linked to the original spend row) — the original debit is never
 * touched. Never restores more than the amount applied, never twice.
 *
 * Anti-avoidance rule: if the wallet ALREADY expired while this credit was locked
 * (an EXPIRATION entry exists after the spend), the restored amount is
 * immediately expired again in the same transaction, so a customer cannot dodge
 * wallet expiry by leaving an unpaid order open. Both entries are appended for a
 * full audit trail.
 */
export async function releaseLockedOrderCreditTx(
  tx: Tx,
  params: { customerId: string | null; orderId: string; appliedMad: number; inactivityDays: number; now: Date },
): Promise<{ restoredMad: number; expiredMad: number; alreadyReleased: boolean }> {
  const { customerId, orderId, appliedMad } = params;
  if (!customerId || appliedMad <= 0) return { restoredMad: 0, expiredMad: 0, alreadyReleased: false };

  const releaseKey = orderExpiryReleaseKey(orderId);
  const existing = await tx.ghostCreditTransaction.findUnique({
    where: { idempotencyKey: releaseKey },
    select: { id: true },
  });
  if (existing) return { restoredMad: 0, expiredMad: 0, alreadyReleased: true };

  const spend = await tx.ghostCreditTransaction.findUnique({
    where: { idempotencyKey: orderSpendKey(orderId) },
    select: { id: true, createdAt: true },
  });
  // Did the wallet expire since this credit was locked?
  let expiredSince = false;
  if (spend) {
    const laterExpiries = await tx.ghostCreditTransaction.count({
      where: { customerId, reason: "expiration", createdAt: { gt: spend.createdAt } },
    });
    expiredSince = laterExpiries > 0;
  }

  await grantCreditTx(tx, {
    customerId,
    amountMad: appliedMad,
    reason: "order_refund_restore",
    idempotencyKey: releaseKey,
    orderId,
    relatedTransactionId: spend?.id ?? null,
    // Restoration is NOT a qualifying earning event → never resets the timer.
    resetsExpiration: false,
    inactivityDays: params.inactivityDays,
    source: "system",
    note: "Crédit Ghost restauré (commande impayée expirée)",
  });

  if (expiredSince) {
    const debit = await debitCreditTx(tx, {
      customerId,
      amountMad: appliedMad,
      reason: "expiration",
      idempotencyKey: orderExpiryCreditExpiredKey(orderId),
      orderId,
      relatedTransactionId: spend?.id ?? null,
      source: "system",
      note: "Crédit restauré puis expiré (portefeuille déjà expiré)",
      allowNegative: false,
    });
    return { restoredMad: appliedMad, expiredMad: debit.appliedMad ?? appliedMad, alreadyReleased: false };
  }
  return { restoredMad: appliedMad, expiredMad: 0, alreadyReleased: false };
}

/** Standalone release (own transaction) — used when an order is manually set to
 *  "expired" outside the batch job. Idempotent. */
export async function releaseLockedOrderCredit(orderId: string): Promise<void> {
  await ensureDatabaseReady();
  const settings = await getStoreSettings();
  const inactivityDays = settings.ghostCredit?.inactivityDays ?? 180;
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, ghostCreditAppliedMad: true },
    });
    if (!order) return;
    await releaseLockedOrderCreditTx(tx, {
      customerId: order.customerId,
      orderId,
      appliedMad: order.ghostCreditAppliedMad,
      inactivityDays,
      now: new Date(),
    });
  });
}

/**
 * Batch job: expire abandoned UNPAID orders that lock Ghost Credit, past the
 * configured expiry window, and release their locked credit — all atomically per
 * order. Only orders in a pre-payment state (no proof submitted, not confirmed/
 * fulfilled/cancelled/refunded/rejected/expired) with ghostCreditAppliedMad > 0
 * are touched. Idempotent: the status transition is a conditional UPDATE and the
 * credit release is keyed per order.
 */
export async function expireAbandonedOrders(now = new Date()): Promise<{
  candidates: number;
  expired: number;
  restoredMad: number;
  expiredCreditMad: number;
}> {
  await ensureDatabaseReady();
  const settings = await getStoreSettings();
  const expiryHours = settings.ghostCredit?.unpaidOrderExpiryHours ?? 24;
  const inactivityDays = settings.ghostCredit?.inactivityDays ?? 180;
  const cutoff = new Date(now.getTime() - expiryHours * 60 * 60 * 1000);

  const candidates = await prisma.order.findMany({
    where: {
      status: { in: [...PENDING_PAYMENT_STATUSES] },
      createdAt: { lt: cutoff },
      ghostCreditAppliedMad: { gt: 0 },
    },
    select: { id: true },
    take: 500,
  });

  let expired = 0;
  let restoredMad = 0;
  let expiredCreditMad = 0;

  for (const candidate of candidates) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Lock + revalidate the order row.
        const order = await tx.order.findUnique({
          where: { id: candidate.id },
          select: { id: true, status: true, customerId: true, ghostCreditAppliedMad: true },
        });
        if (!order || !isPendingPayment(order.status) || order.ghostCreditAppliedMad <= 0) return null;

        // Atomic status guard: only expire while still unpaid.
        const upd = await tx.order.updateMany({
          where: { id: order.id, status: { in: [...PENDING_PAYMENT_STATUSES] } },
          data: { status: "expired" },
        });
        if (upd.count !== 1) return null;

        await tx.paymentEvent.create({
          data: {
            orderId: order.id,
            type: "status_change",
            fromStatus: order.status,
            toStatus: "expired",
            note: `Commande impayée expirée automatiquement après ${expiryHours} h.`,
          },
        });

        // Release promo reservation + locked credit (with anti-avoidance expiry).
        await releaseOrderPromotion(order.id, tx);
        const release = await releaseLockedOrderCreditTx(tx, {
          customerId: order.customerId,
          orderId: order.id,
          appliedMad: order.ghostCreditAppliedMad,
          inactivityDays,
          now,
        });
        return release;
      });

      if (result) {
        expired += 1;
        restoredMad += result.restoredMad;
        expiredCreditMad += result.expiredMad;
      }
    } catch (error) {
      console.error("[cron:order-expiry] failed", candidate.id, error);
    }
  }

  console.info(
    "[cron:order-expiry] done",
    JSON.stringify({ candidates: candidates.length, expired, restoredMad, expiredCreditMad }),
  );
  return { candidates: candidates.length, expired, restoredMad, expiredCreditMad };
}
