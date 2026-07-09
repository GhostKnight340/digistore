import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { publicOrderReference } from "@/lib/db/orders";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { notifyPaymentStatusChange } from "@/lib/discord/notify";
import type { ActionResult } from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

/**
 * A customer may be auto-removed while deleting orders ONLY if it is a pure
 * orphaned GUEST record: no remaining orders, no login credential
 * (password/Google/Discord), and not an admin.
 *
 * This guard exists because a previous version deleted ANY order-less customer
 * (`{ orders: { none: {} } }`), which wiped registered accounts — including the
 * admin's own — silently dropping their password and Discord link and
 * recreating a Google-only account on the next login. NEVER widen this without
 * keeping the credential + role guard.
 */
const ORPHAN_GUEST_CUSTOMER: Prisma.CustomerWhereInput = {
  orders: { none: {} },
  role: { not: "ADMIN" },
  passwordHash: null,
  googleId: null,
  discordId: null,
};

const NOTIFIABLE_PAYMENT_STATUSES: OrderStatus[] = [
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
  "rejected",
  "refunded",
  "cancelled",
];

const ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "payment_submitted",
  "payment_confirmed",
  "payment_issue",
  "rejected",
  "delivered",
  "refunded",
  "cancelled",
];

export interface ChangeOrderStatusInput {
  orderId: string;
  toStatus: OrderStatus;
  note?: string;
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await ensureDatabaseReady();

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, customerId: true },
      });
      if (!order) throw new Error("Commande introuvable.");

      await tx.digitalCode.updateMany({
        where: { assignedOrderId: orderId },
        data: { assignedOrderId: null },
      });
      await tx.deliveredCode.deleteMany({ where: { orderId } });
      await tx.paymentProof.deleteMany({ where: { orderId } });
      await tx.paymentEvent.deleteMany({ where: { orderId } });
      await tx.emailLog.deleteMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
      if (order.customerId) {
        // Only clean up a pure orphaned guest — never a loginable/admin account.
        await tx.customer.deleteMany({
          where: { id: order.customerId, ...ORPHAN_GUEST_CUSTOMER },
        });
      }
    });

    return { ok: true };
  } catch (error) {
    console.error("[deleteOrder]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Suppression impossible.",
    };
  }
}

export async function clearAllOrders(
  resetOrderNumbering: boolean,
): Promise<ActionResult> {
  await ensureDatabaseReady();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.digitalCode.updateMany({
        where: { assignedOrderId: { not: null } },
        data: { assignedOrderId: null },
      });
      await tx.deliveredCode.deleteMany();
      await tx.paymentProof.deleteMany();
      await tx.paymentEvent.deleteMany();
      await tx.emailLog.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      // Only sweep pure orphaned guests — preserve every registered/admin account.
      await tx.customer.deleteMany({ where: ORPHAN_GUEST_CUSTOMER });
    });

    void resetOrderNumbering;
    return { ok: true };
  } catch (error) {
    console.error("[clearAllOrders]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Purge impossible.",
    };
  }
}

export async function changeOrderStatus(
  input: ChangeOrderStatusInput,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  if (!ORDER_STATUSES.includes(input.toStatus)) {
    return { ok: false, error: "Statut de commande invalide." };
  }

  if (input.toStatus === "delivered") {
    return {
      ok: false,
      error: "Utilisez le flux de livraison normal pour passer une commande en Livree.",
    };
  }

  try {
    let fromStatus: string | undefined;
    let createdAt: Date | undefined;
    let cardOrder:
      | {
          id: string;
          status: string;
          totalMad: number;
          paymentMethod: string;
          discordMessageId: string | null;
          discordThreadId: string | null;
        }
      | undefined;
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          totalMad: true,
          paymentMethod: true,
          discordMessageId: true,
          discordThreadId: true,
        },
      });
      if (!order) throw new Error("Commande introuvable.");
      if (order.status === input.toStatus) {
        throw new Error("La commande a deja ce statut.");
      }
      fromStatus = order.status;
      createdAt = order.createdAt;
      cardOrder = order;

      await tx.order.update({
        where: { id: input.orderId },
        data: { status: input.toStatus },
      });
      await tx.paymentEvent.create({
        data: {
          orderId: input.orderId,
          type: "admin_status_change",
          fromStatus: order.status,
          toStatus: input.toStatus,
          note: input.note?.trim()
            ? `Changement manuel admin: ${input.note.trim()}`
            : "Changement manuel admin.",
        },
      });
    });

    if (NOTIFIABLE_PAYMENT_STATUSES.includes(input.toStatus) && createdAt && cardOrder) {
      const reference = await publicOrderReference({ id: input.orderId, createdAt });
      void notifyPaymentStatusChange({
        order: cardOrder,
        publicOrderNumber: reference.number,
        fromStatus,
        toStatus: input.toStatus,
        note: input.note?.trim() || undefined,
        adminUrl: absoluteAppUrl(`/admin/orders/${input.orderId}`),
      });
    }

    return { ok: true };
  } catch (error) {
    console.error("[changeOrderStatus]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Changement de statut impossible.",
    };
  }
}
