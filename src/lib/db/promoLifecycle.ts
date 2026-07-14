import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { grantCreditTx, debitCreditTx, expireWalletIfDue, ghostCreditInactivityDays } from "./ghostCredit";
import { isGhostCreditReward, computeCreditReversal } from "@/lib/promo/engine";
import { promoCreditKey, promoReversalKey, orderRefundKey } from "@/lib/promo/ledgerMath";
import type { PromoRewardType } from "@/lib/types";

type Tx = Prisma.TransactionClient;

/**
 * Promo redemption lifecycle (see docs/promo-codes.md):
 *   reserve  — at order creation (reservePromoInTx)
 *   finalize — when the order reaches its successful paid state (payment_confirmed)
 *   release  — when the order is cancelled/rejected/expired
 *
 * Ghost Credit is granted ONLY at finalize, never at reservation, so cancelled /
 * unpaid / rejected orders grant nothing. Every function here is idempotent so a
 * duplicated webhook, a retried admin action, or a double completion run can
 * never double-grant, double-release, or double-count usage.
 */

/**
 * Finalize an order's promo redemption and grant any Ghost Credit reward.
 * Idempotent: safe to call from every "→ payment_confirmed" path and again on a
 * duplicate webhook. Runs in its own transaction unless one is supplied.
 */
export async function finalizeOrderPromotion(orderId: string, existingTx?: Tx): Promise<void> {
  const inactivityDays = await ghostCreditInactivityDays();
  const run = async (tx: Tx) => {
    const redemption = await tx.promoRedemption.findUnique({
      where: { orderId },
      select: { id: true, status: true, promoCodeId: true, customerId: true },
    });
    if (!redemption) return; // no promo on this order
    if (redemption.status === "finalized") return; // already done (idempotent)
    if (redemption.status === "released") return; // cancelled/rejected — never grant

    await tx.promoRedemption.update({
      where: { id: redemption.id },
      data: { status: "finalized", finalizedAt: new Date() },
    });

    const snapshot = await tx.orderPromotionSnapshot.findUnique({
      where: { orderId },
      select: {
        promoCodeId: true,
        code: true,
        rewardType: true,
        eligibleSubtotalMad: true,
        expectedCreditMad: true,
        creditExpiresAt: true,
        configuredPercent: true,
        configuredFixedMad: true,
      },
    });
    if (!snapshot) return;
    const rewardType = snapshot.rewardType as PromoRewardType;
    if (!isGhostCreditReward(rewardType) || snapshot.expectedCreditMad <= 0) return;

    const order = await tx.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    const customerId = order?.customerId ?? redemption.customerId;
    if (!customerId) {
      // Credit codes require login, so this should not happen; record for review
      // rather than silently discarding the reward.
      if (snapshot.promoCodeId) {
        await tx.promoCodeEvent.create({
          data: {
            promoCodeId: snapshot.promoCodeId,
            type: "note",
            note: `Crédit Ghost non attribué (commande ${orderId} sans compte client) — à vérifier.`,
          },
        });
      }
      return;
    }

    await grantCreditTx(tx, {
      customerId,
      amountMad: snapshot.expectedCreditMad,
      reason: "promo_reward",
      idempotencyKey: promoCreditKey(orderId, snapshot.promoCodeId ?? snapshot.code),
      promoCodeId: snapshot.promoCodeId,
      orderId,
      rewardType,
      eligibleSubtotalMad: snapshot.eligibleSubtotalMad,
      configuredPercent: snapshot.configuredPercent ? Number(snapshot.configuredPercent.toString()) : null,
      configuredFixedMad: snapshot.configuredFixedMad,
      // Promo Ghost Credit from a paid+completed order is a QUALIFYING reward —
      // it resets the 180-day inactivity timer.
      resetsExpiration: true,
      inactivityDays,
      source: "system",
      note: `Crédit Ghost — code ${snapshot.code}`,
    });
  };

  if (existingTx) return run(existingTx);
  await prisma.$transaction(run);
}

/**
 * Release an order's promo reservation (order cancelled/rejected/expired),
 * freeing the usage slot. Idempotent. Never touches an already-finalized
 * redemption (a paid order that was later refunded is handled by the reversal
 * path, not here).
 */
export async function releaseOrderPromotion(orderId: string, existingTx?: Tx): Promise<void> {
  const run = async (tx: Tx) => {
    const redemption = await tx.promoRedemption.findUnique({
      where: { orderId },
      select: { id: true, status: true, promoCodeId: true },
    });
    if (!redemption) return;
    if (redemption.status !== "reserved") return; // finalized or already released

    await tx.promoRedemption.update({
      where: { id: redemption.id },
      data: { status: "released", releasedAt: new Date() },
    });
    // Decrement the live counter without dropping below zero.
    await tx.promoCode.updateMany({
      where: { id: redemption.promoCodeId, reservedUses: { gt: 0 } },
      data: { reservedUses: { decrement: 1 } },
    });
  };

  if (existingTx) return run(existingTx);
  await prisma.$transaction(run);
}

/**
 * Dispatch the correct promo-lifecycle side effect for a status transition.
 * Call this post-commit from every order status-change path; each underlying
 * action is idempotent, so duplicate or repeated calls are safe. Best-effort:
 * failures are logged, never thrown back into the payment flow.
 *   → payment_confirmed / delivered  finalize redemption + grant Ghost Credit
 *   → cancelled / rejected           release reservation
 *   → refunded                       reverse granted Ghost Credit (full)
 */
export async function applyPromoLifecycleForStatus(orderId: string, toStatus: string): Promise<void> {
  try {
    if (toStatus === "payment_confirmed" || toStatus === "delivered") {
      await finalizeOrderPromotion(orderId);
      // Evaluate spending milestones now that this order counts as qualifying.
      const { grantMilestonesForCompletedOrder } = await import("./milestones");
      await grantMilestonesForCompletedOrder(orderId);
    } else if (toStatus === "cancelled" || toStatus === "rejected") {
      await releaseOrderPromotion(orderId);
      // The order never completed → give back any Ghost Credit spent on it.
      await refundSpentCreditForOrder(orderId);
    } else if (toStatus === "refunded") {
      await reverseOrderPromotionCredit(orderId);
      // A refunded order is reversed → return the Ghost Credit spent on it.
      await refundSpentCreditForOrder(orderId);
      // Refund reduces qualifying spend → reverse milestones no longer qualified.
      const { reverseMilestonesForOrder } = await import("./milestones");
      await reverseMilestonesForOrder(orderId);
    }
  } catch (error) {
    console.error("[applyPromoLifecycleForStatus]", orderId, toStatus, error);
  }
}

/**
 * Return Ghost Credit the customer spent on an order that did not complete
 * (cancelled/rejected/refunded). Idempotent per order — a re-credit is granted
 * at most once, and the grant resets the wallet's 60-day expiry like any credit.
 */
export async function refundSpentCreditForOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, ghostCreditAppliedMad: true },
    });
    if (!order || !order.customerId || order.ghostCreditAppliedMad <= 0) return;
    // Refresh expiry state first so the re-credit sets a clean new deadline.
    await expireWalletIfDue(tx, order.customerId);
    await grantCreditTx(tx, {
      customerId: order.customerId,
      amountMad: order.ghostCreditAppliedMad,
      reason: "order_spend_refund",
      idempotencyKey: orderRefundKey(orderId),
      orderId,
      source: "system",
      note: "Crédit Ghost restitué (commande non finalisée)",
    });
  });
}

/**
 * Reverse promotional Ghost Credit when an order is refunded.
 *
 *  - refundedEligibleMad defaults to the FULL eligible subtotal (full refund).
 *  - For percentage credit the reversal is proportional to the refunded eligible
 *    amount; for fixed credit it's full when all eligible items are refunded,
 *    else prorated (see computeCreditReversal).
 *  - If some of the granted credit was already spent (would push the wallet
 *    negative) the case is flagged for admin review instead of writing an
 *    unexplained negative balance.
 * Idempotent per (order, promo, seq).
 */
export async function reverseOrderPromotionCredit(
  orderId: string,
  opts: { refundedEligibleMad?: number; source?: string; seq?: number } = {},
): Promise<{ ok: boolean; reversedMad: number; flaggedForReview: boolean }> {
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.orderPromotionSnapshot.findUnique({
      where: { orderId },
      select: {
        promoCodeId: true,
        code: true,
        rewardType: true,
        eligibleSubtotalMad: true,
        expectedCreditMad: true,
        configuredPercent: true,
      },
    });
    if (!snapshot) return { ok: true, reversedMad: 0, flaggedForReview: false };
    const rewardType = snapshot.rewardType as PromoRewardType;
    if (!isGhostCreditReward(rewardType)) return { ok: true, reversedMad: 0, flaggedForReview: false };

    // Only reverse credit that was actually granted (finalized order).
    const grant = await tx.ghostCreditTransaction.findUnique({
      where: { idempotencyKey: promoCreditKey(orderId, snapshot.promoCodeId ?? snapshot.code) },
      select: { customerId: true, amountMad: true, status: true },
    });
    if (!grant || grant.status !== "active") return { ok: true, reversedMad: 0, flaggedForReview: false };

    const refundedEligibleMad = opts.refundedEligibleMad ?? snapshot.eligibleSubtotalMad;
    const reversalMad = computeCreditReversal({
      rewardType,
      grantedCreditMad: grant.amountMad,
      eligibleSubtotalMad: snapshot.eligibleSubtotalMad,
      refundedEligibleMad,
      percentValue: snapshot.configuredPercent ? Number(snapshot.configuredPercent.toString()) : null,
    });
    if (reversalMad <= 0) return { ok: true, reversedMad: 0, flaggedForReview: false };

    const debit = await debitCreditTx(tx, {
      customerId: grant.customerId,
      amountMad: reversalMad,
      reason: "promo_reversal",
      idempotencyKey: promoReversalKey(orderId, snapshot.promoCodeId ?? snapshot.code, opts.seq ?? 1),
      promoCodeId: snapshot.promoCodeId,
      orderId,
      rewardType,
      source: opts.source ?? "system",
      note: `Reprise crédit Ghost — remboursement commande`,
      allowNegative: false,
    });

    const flaggedForReview = Boolean(debit.wouldGoNegative);
    if (flaggedForReview) {
      // The promotional credit was already (partly) spent, so we can't fully
      // claw it back without a negative balance. Freeze the wallet — blocking
      // further spending until an admin resolves it — instead of leaving an
      // unexplained negative balance, and record the case.
      await tx.customer.update({
        where: { id: grant.customerId },
        data: {
          walletFrozen: true,
          walletFrozenReason: `Remboursement commande ${orderId}: crédit promo déjà dépensé, reprise incomplète — révision requise.`,
        },
      });
      if (snapshot.promoCodeId) {
        await tx.promoCodeEvent.create({
          data: {
            promoCodeId: snapshot.promoCodeId,
            type: "note",
            note: `Remboursement commande ${orderId}: ${reversalMad} DH de crédit Ghost à reprendre mais une partie a déjà été dépensée — portefeuille gelé, révision manuelle requise.`,
          },
        });
      }
    }
    return { ok: true, reversedMad: debit.appliedMad ?? reversalMad, flaggedForReview };
  });
}
