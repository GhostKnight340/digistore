import "server-only";

import { prisma } from "@/lib/prisma";
import type { ActionResult, ItemAssignment } from "@/lib/dto";

/** Admin: mark payment confirmed (works from any non-delivered status). */
export async function confirmPayment(orderId: string): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Payment already confirmed." };
  }

  const fromStatus = order.status;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "payment_confirmed" },
    }),
    prisma.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus,
        toStatus: "payment_confirmed",
        note: "Admin confirmed payment.",
      },
    }),
    prisma.emailLog.create({
      data: {
        orderId,
        type: "payment_confirmed",
        recipient: order.customerEmail,
        subject: "Paiement confirmé",
        body: "Your payment has been confirmed. Your code will be delivered shortly.",
      },
    }),
  ]);
  return { ok: true };
}

/**
 * Admin: deliver codes. In one transaction:
 *  - validates each order item has `quantity` codes (inventory or manual),
 *  - marks selected DigitalCodes as used,
 *  - creates DeliveredCode records,
 *  - sets the order to delivered,
 *  - logs a simulated code_delivered email.
 */
export async function deliverOrder(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "delivered") {
      return { ok: false, error: "Order is already delivered." };
    }
    if (order.status !== "payment_confirmed") {
      return { ok: false, error: "Payment must be confirmed before delivery." };
    }

    for (const item of order.items) {
      const entries = (
        assignments.find((a) => a.orderItemId === item.id)?.codes ?? []
      ).filter((e) => e.digitalCodeId || e.manualCode?.trim());
      if (entries.length < item.quantity) {
        return {
          ok: false,
          error: "Assign a code to every unit before delivering.",
        };
      }
    }

    const now = new Date();

    for (const item of order.items) {
      const entries = (
        assignments.find((a) => a.orderItemId === item.id)?.codes ?? []
      )
        .filter((e) => e.digitalCodeId || e.manualCode?.trim())
        .slice(0, item.quantity);

      for (const entry of entries) {
        let digitalCodeId: string | null = null;
        let manualCode: string | null = null;

        if (entry.digitalCodeId) {
          const code = await tx.digitalCode.findUnique({
            where: { id: entry.digitalCodeId },
          });
          if (!code || code.status === "used" || code.status === "disabled") {
            throw new Error("Selected code is no longer available.");
          }
          await tx.digitalCode.update({
            where: { id: code.id },
            data: { status: "used", assignedOrderId: orderId, usedAt: now },
          });
          digitalCodeId = code.id;
        } else {
          manualCode = entry.manualCode!.trim();
        }

        await tx.deliveredCode.create({
          data: {
            orderId,
            orderItemId: item.id,
            productId: item.productId,
            digitalCodeId,
            manualCode,
          },
        });
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "delivered" },
    });

    await tx.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus: "payment_confirmed",
        toStatus: "delivered",
        note: "Admin delivered code(s).",
      },
    });

    await tx.emailLog.create({
      data: {
        orderId,
        type: "code_delivered",
        recipient: order.customerEmail,
        subject: "Votre code est disponible",
        body: "Your payment was confirmed. Your code is now available. Thank you for your purchase.",
      },
    });

    return { ok: true };
  }).catch((e: unknown) => ({
    ok: false,
    error: e instanceof Error ? e.message : "Delivery failed.",
  }));
}
