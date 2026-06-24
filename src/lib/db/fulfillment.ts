import "server-only";

import { prisma } from "@/lib/prisma";
import type { ActionResult, ItemAssignment } from "@/lib/dto";

/** Admin: mark payment confirmed and log a simulated payment_confirmed email. */
export async function confirmPayment(orderId: string): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending_payment") {
    return { ok: false, error: "Payment is not pending." };
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "payment_confirmed" },
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
 * Admin: confirm-and-deliver. In one transaction:
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

    // Validate every item has enough non-empty code entries.
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
            // Abort the whole transaction — code no longer available.
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

    await tx.emailLog.create({
      data: {
        orderId,
        type: "code_delivered",
        recipient: order.customerEmail,
        subject: "Paiement confirmé — votre code est disponible",
        body: "Your payment was confirmed. Here is your code. Thank you for your purchase and we hope to see you again.",
      },
    });

    return { ok: true };
  }).catch((e: unknown) => ({
    ok: false,
    error: e instanceof Error ? e.message : "Delivery failed.",
  }));
}
