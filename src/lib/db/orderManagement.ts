import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { DEV_ONLY_ORDER_TOOLS_ENABLED } from "@/lib/devMode";
import type { ActionResult } from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

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

function ensureDevOnly(): ActionResult | null {
  if (DEV_ONLY_ORDER_TOOLS_ENABLED) return null;
  return { ok: false, error: "Development-only order tools are disabled." };
}

export async function deleteOrderDevOnly(orderId: string): Promise<ActionResult> {
  const blocked = ensureDevOnly();
  if (blocked) return blocked;

  await ensureDatabaseReady();

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true },
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
    });

    return { ok: true };
  } catch (error) {
    console.error("[deleteOrderDevOnly]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Suppression impossible.",
    };
  }
}

export async function clearAllOrdersDevOnly(
  resetOrderNumbering: boolean,
): Promise<ActionResult> {
  const blocked = ensureDevOnly();
  if (blocked) return blocked;

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
    });

    void resetOrderNumbering;
    return { ok: true };
  } catch (error) {
    console.error("[clearAllOrdersDevOnly]", error);
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
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        select: { id: true, status: true },
      });
      if (!order) throw new Error("Commande introuvable.");
      if (order.status === input.toStatus) {
        throw new Error("La commande a deja ce statut.");
      }

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

    return { ok: true };
  } catch (error) {
    console.error("[changeOrderStatus]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Changement de statut impossible.",
    };
  }
}
