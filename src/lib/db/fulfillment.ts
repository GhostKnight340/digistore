import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { formatPublicOrderNumber } from "@/lib/orderNumber";
import type { ActionResult, ItemAssignment } from "@/lib/dto";

export async function confirmPayment(orderId: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await timeAdmin(
    "admin.confirmPayment",
    "order.findUnique",
    () => prisma.order.findUnique({ where: { id: orderId } }),
    (row) => (row ? 1 : 0),
  );
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Paiement déjà confirmé." };
  }
  try {
    await timeAdmin("admin.confirmPayment", "transaction.statusEmailEvent", () => prisma.$transaction(async (tx) => {
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
          note: "Paiement confirmé par l’admin.",
        },
      });
    }), () => 3);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey: "payment_confirmed",
        type: "payment_confirmed",
        variables: {
          customer_name: order.customerName,
          order_number: formatPublicOrderNumber(order.orderSeq),
          order_url: `/order/${order.id}`,
          total: `${order.totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:payment_confirmed]", emailError);
    }

    return { ok: true };
  } catch (error) {
    console.error("[confirmPayment]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Confirmation impossible.",
    };
  }
}

export async function deliverOrder(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await timeAdmin(
    "admin.deliverOrder",
    "order.findUnique.items",
    () =>
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderSeq: true,
          status: true,
          customerId: true,
          customerName: true,
          customerEmail: true,
          totalMad: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
            },
          },
        },
      }),
    (row) => row?.items.length ?? 0,
  );
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.status === "delivered") {
    return { ok: false, error: "Commande déjà livrée." };
  }
  if (order.status !== "payment_confirmed") {
    return { ok: false, error: "Le paiement doit être confirmé avant la livraison." };
  }

  for (const item of order.items) {
    const assignment = assignments.find((entry) => entry.orderItemId === item.id);
    const entries = (assignment?.codes ?? []).filter(
      (entry) => entry.digitalCodeId || entry.manualCode?.trim(),
    );
    if (entries.length < item.quantity) {
      return {
        ok: false,
        error: "Attribuez un code à chaque unité avant la livraison.",
      };
    }
  }

  try {
    const deliveredValues: string[] = [];
    await timeAdmin("admin.deliverOrder", "transaction.deliverCodes", () => prisma.$transaction(async (tx) => {
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
              throw new Error("Le code sélectionné n’est plus disponible.");
            }
            if (item.variantId && code.variantId !== item.variantId) {
              throw new Error("Le code sélectionné ne correspond pas à la variante commandée.");
            }

            const claim = await tx.digitalCode.updateMany({
              where: {
                id: entry.digitalCodeId,
                status: "unused",
                ...(item.variantId ? { variantId: item.variantId } : {}),
              },
              data: {
                status: "used",
                assignedOrderId: orderId,
                usedAt: new Date(),
              },
            });
            if (claim.count !== 1) {
              throw new Error("Le code sélectionné n’est plus disponible.");
            }
            digitalCodeId = entry.digitalCodeId;
            deliveredValues.push(code.code);
          } else {
            manualCode = entry.manualCode!.trim();
            deliveredValues.push(manualCode);
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
          note: "Code(s) livré(s) par l’admin.",
        },
      });
    }), () => assignments.length);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey: "order_delivered",
        type: "code_delivered",
        variables: {
          customer_name: order.customerName,
          order_number: formatPublicOrderNumber(order.orderSeq),
          delivery_url: `/delivery/${orderId}`,
          total: `${order.totalMad} MAD`,
          codes: deliveredValues.join("\n"),
        },
      });
    } catch (emailError) {
      console.error("[email:order_delivered]", emailError);
    }

    return { ok: true };
  } catch (error) {
    console.error("[deliverOrder]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Livraison impossible.",
    };
  }
}
