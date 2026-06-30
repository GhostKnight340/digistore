import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
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
      await tx.emailLog.create({
        data: {
          orderId,
          type: "payment_confirmed",
          recipient: order.customerEmail,
          subject: "Paiement confirmé",
          body: "Votre paiement a été confirmé. Votre produit numérique sera disponible sous peu.",
        },
      });
    }), () => 3);

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
          status: true,
          customerEmail: true,
          items: {
            select: {
              id: true,
              productId: true,
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
    await timeAdmin("admin.deliverOrder", "transaction.deliverCodes", () => prisma.$transaction(async (tx) => {
      const deliveredValues: string[] = [];
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

            const claim = await tx.digitalCode.updateMany({
              where: { id: entry.digitalCodeId, status: "unused" },
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
      await tx.emailLog.create({
        data: {
          orderId,
          type: "code_delivered",
          recipient: order.customerEmail,
          subject: "Votre code est disponible",
          body: `Votre paiement a été confirmé. Votre produit numérique est maintenant disponible.\n\nCodes :\n${deliveredValues.join("\n")}\n\nMerci pour votre achat.`,
        },
      });
    }), () => assignments.length);

    return { ok: true };
  } catch (error) {
    console.error("[deliverOrder]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Livraison impossible.",
    };
  }
}
