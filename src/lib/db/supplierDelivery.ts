/**
 * Exactly-once delivery of a completed supplier fulfillment slot.
 *
 * Separated from deliverOrder because supplier goods can arrive LATER than the
 * admin's delivery action — an order that came back "processing" is finished by
 * the reconciliation cron or a webhook, long after the original request ended.
 * Both paths converge here.
 *
 * The exactly-once guarantee is enforced by the database, not by checks:
 *
 *  1. `markDelivered` is a compare-and-set on `deliveredAt IS NULL`. A second
 *     concurrent caller updates 0 rows and aborts.
 *  2. `DeliveredCode.supplierFulfillmentId` is UNIQUE. Even if (1) were somehow
 *     bypassed, the insert fails.
 *
 * Both live inside one transaction, so a crash between them cannot leave a
 * delivered-but-unrecorded slot.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { markDelivered } from "@/lib/suppliers/ledger";
import { primaryDeliveryValue } from "@/lib/suppliers/deliveryFields";
import type { DeliveredFieldDTO } from "@/lib/dto";

export type SlotDeliveryResult =
  | { ok: true; deliveredCodeId: string; fields: DeliveredFieldDTO[] }
  /** Already delivered by an earlier call — NOT an error, and not a re-delivery. */
  | { ok: false; reason: "already_delivered" }
  | { ok: false; reason: "not_ready" | "no_payload"; message: string };

/**
 * Writes the DeliveredCode row for a completed slot and flips the ledger to
 * `delivered`, atomically.
 *
 * Returns `already_delivered` rather than throwing when it loses the race, so
 * callers (cron, webhook, admin) can treat a duplicate attempt as a no-op
 * instead of surfacing a scary error for what is normal concurrent behaviour.
 */
export async function deliverFulfilledSlot(
  fulfillmentId: string,
): Promise<SlotDeliveryResult> {
  const row = await prisma.supplierFulfillment.findUnique({
    where: { id: fulfillmentId },
    select: {
      id: true,
      orderId: true,
      orderItemId: true,
      status: true,
      deliveredAt: true,
      deliveryPayload: true,
      providerOrderId: true,
      supplier: true,
      orderItem: { select: { productId: true } },
    },
  });

  if (!row) {
    return { ok: false, reason: "not_ready", message: "Slot de livraison introuvable." };
  }
  if (row.deliveredAt) {
    return { ok: false, reason: "already_delivered" };
  }
  if (row.status !== "completed") {
    return {
      ok: false,
      reason: "not_ready",
      message: `Le slot n’est pas prêt à être livré (statut : ${row.status}).`,
    };
  }

  const fields = Array.isArray(row.deliveryPayload)
    ? (row.deliveryPayload as unknown as DeliveredFieldDTO[])
    : [];
  if (fields.length === 0) {
    return {
      ok: false,
      reason: "no_payload",
      message:
        "Aucun code exploitable enregistré pour ce slot — récupérez-le chez le fournisseur et livrez manuellement.",
    };
  }

  try {
    const deliveredCodeId = await prisma.$transaction(async (tx) => {
      // Compare-and-set FIRST: if we do not win this, no row is written.
      const won = await markDelivered(row.id, tx);
      if (!won) return null;

      const created = await tx.deliveredCode.create({
        data: {
          orderId: row.orderId,
          orderItemId: row.orderItemId,
          productId: row.orderItem.productId,
          source: row.supplier,
          manualCode: primaryDeliveryValue(fields),
          deliveryPayload: fields as unknown as Prisma.InputJsonValue,
          fazercardsOrderId:
            row.supplier === "fazercards" ? row.providerOrderId : null,
          supplierFulfillmentId: row.id,
        },
        select: { id: true },
      });
      return created.id;
    });

    if (!deliveredCodeId) return { ok: false, reason: "already_delivered" };
    return { ok: true, deliveredCodeId, fields };
  } catch (error) {
    // The unique index on supplierFulfillmentId is the last line of defence.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, reason: "already_delivered" };
    }
    throw error;
  }
}

/** Slots that are purchased and parsed but not yet handed to the customer. */
export function listDeliverableSlots(limit = 25) {
  return prisma.supplierFulfillment.findMany({
    where: { status: "completed", deliveredAt: null },
    orderBy: { completedAt: "asc" },
    take: limit,
    select: { id: true, orderId: true },
  });
}
