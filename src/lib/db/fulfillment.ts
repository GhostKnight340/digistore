import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import type { ActionResult, ItemAssignment } from "@/lib/dto";

export async function confirmPayment(orderId: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Payment already confirmed." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "payment_confirmed" },
      });
      await tx.paymentEvent.create({
        data: {
          orderId,
          type: "status_change",
          fromStatus: order.status,
          toStatus: "payment_confirmed",
          note: "Admin confirmed payment.",
        },
      });
      await tx.emailLog.create({
        data: {
          orderId,
          type: "payment_confirmed",
          recipient: order.customerEmail,
          subject: "Paiement confirme",
          body: "Your payment has been confirmed. Your code will be delivered shortly.",
        },
      });
    });

    return { ok: true };
  } catch (error) {
    console.error("[confirmPayment]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Confirm failed.",
    };
  }
}

export async function deliverOrder(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({
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
    const assignment = assignments.find((entry) => entry.orderItemId === item.id);
    const entries = (assignment?.codes ?? []).filter(
      (entry) => entry.digitalCodeId || entry.manualCode?.trim(),
    );
    if (entries.length < item.quantity) {
      return {
        ok: false,
        error: "Assign a code to every unit before delivering.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const assignment = assignments.find((entry) => entry.orderItemId === item.id);
        const entries = (assignment?.codes ?? [])
          .filter((entry) => entry.digitalCodeId || entry.manualCode?.trim())
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

            const claim = await tx.digitalCode.updateMany({
              where: { id: entry.digitalCodeId, status: "unused" },
              data: {
                status: "used",
                assignedOrderId: orderId,
                usedAt: new Date(),
              },
            });
            if (claim.count !== 1) {
              throw new Error("Selected code is no longer available.");
            }
            digitalCodeId = entry.digitalCodeId;
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
    });

    return { ok: true };
  } catch (error) {
    console.error("[deliverOrder]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Delivery failed.",
    };
  }
}
