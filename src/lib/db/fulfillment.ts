import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { publicOrderReference } from "@/lib/db/orders";
import { resolveOrderPaymentSummary } from "@/lib/db/paymentMethods";
import { absoluteAppUrl } from "@/lib/orderNumber";
import {
  notifyPaymentStatusChange,
  notifyFulfillmentNeeded,
  notifyFulfillmentCompleted,
  notifyStockAlert,
} from "@/lib/discord/notify";
import type { ActionResult, AssignmentEntry, ItemAssignment } from "@/lib/dto";
import {
  placeGiftCardOrder,
  getGiftCardOrderStatus,
  getGiftCardOrderCards,
  type ReloadlyGiftCardOrderCard,
} from "@/lib/reloadly/operations";

const LOW_STOCK_THRESHOLD = 3;
const RELOADLY_SENDER_NAME = "ghost.ma";
const RELOADLY_STATUS_POLL_ATTEMPTS = 3;
const RELOADLY_STATUS_POLL_DELAY_MS = 1500;

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

    const reference = await publicOrderReference(order);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey: "payment_confirmed",
        type: "payment_confirmed",
        variables: {
          customer_name: order.customerName,
          order_number: reference.number,
          order_url: absoluteAppUrl(`/order/${reference.pathSegment}`),
          total: `${order.totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:payment_confirmed]", emailError);
    }

    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
    const paymentSummary = await resolveOrderPaymentSummary(order);
    const notifyOrder = { ...order, paymentMethod: paymentSummary.label, bankName: paymentSummary.bankName };
    void notifyPaymentStatusChange({
      order: notifyOrder,
      publicOrderNumber: reference.number,
      fromStatus: order.status,
      toStatus: "payment_confirmed",
      adminUrl,
    });
    void notifyFulfillmentNeeded({
      order: notifyOrder,
      publicOrderNumber: reference.number,
      itemCount: await prisma.orderItem.count({ where: { orderId } }),
      adminUrl,
    });

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
          customerId: true,
          customerName: true,
          customerEmail: true,
          totalMad: true,
          paymentMethod: true,
          discordMessageId: true,
          discordThreadId: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              variant: {
                select: {
                  reloadlyProductId: true,
                  reloadlyCountryCode: true,
                  faceValue: true,
                },
              },
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
    const entries = filledEntriesForItem(item, assignments);
    if (entries.length < item.quantity) {
      return {
        ok: false,
        error: "Attribuez un code à chaque unité avant la livraison.",
      };
    }
  }

  // Resolve any Reloadly-sourced entries BEFORE opening a DB transaction —
  // these are slow, fallible external HTTP calls (and real wallet spend) and
  // must never happen while a Postgres transaction is held open. If any
  // fails, we abort here with zero DB writes, same as the validation above.
  //
  // Note: this purchases from Reloadly per-entry, sequentially, with no
  // persisted idempotency ledger. For an order with a single Reloadly item
  // this is safe (all-or-nothing). If a delivery request spans multiple
  // Reloadly-sourced items and a later one fails, re-clicking "Livrer" will
  // re-purchase the earlier ones too — acceptable for the current
  // single-supplier-item use case, not for high-volume multi-item orders.
  const reloadlyResolutions = new Map<string, ResolvedReloadlyEntry>();
  for (const item of order.items) {
    const entries = filledEntriesForItem(item, assignments);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry.reloadlyProductId) continue;

      const variant = item.variant;
      if (!variant || variant.reloadlyProductId !== entry.reloadlyProductId) {
        return { ok: false, error: "Configuration Reloadly invalide pour cet article." };
      }
      if (!variant.reloadlyCountryCode) {
        return { ok: false, error: "Code pays Reloadly manquant pour cette variante." };
      }
      if (variant.faceValue == null) {
        return { ok: false, error: "Valeur faciale manquante pour la variante Reloadly." };
      }

      try {
        const resolved = await resolveReloadlyEntry({
          productId: variant.reloadlyProductId,
          countryCode: variant.reloadlyCountryCode,
          unitPrice: variant.faceValue,
          customIdentifier: `${orderId}-${item.id}-${index}`,
          recipientEmail: order.customerEmail,
        });
        reloadlyResolutions.set(`${item.id}:${index}`, resolved);
      } catch (error) {
        console.error("[deliverOrder:reloadly]", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? `Échec de la commande Reloadly : ${error.message}`
              : "Échec de la commande Reloadly.",
        };
      }
    }
  }

  try {
    const deliveredValues: string[] = [];
    const consumedByVariant = new Map<
      string,
      { productId: string; variantId: string | null; count: number }
    >();
    await timeAdmin("admin.deliverOrder", "transaction.deliverCodes", () => prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const entries = filledEntriesForItem(item, assignments);

        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          let digitalCodeId: string | null = null;
          let manualCode: string | null = null;
          let source: string | undefined;
          let reloadlyTransactionId: number | null = null;
          let reloadlyOrderId: number | null = null;

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

            const variantKey = `${code.productId}:${code.variantId ?? ""}`;
            const existing = consumedByVariant.get(variantKey);
            if (existing) {
              existing.count += 1;
            } else {
              consumedByVariant.set(variantKey, {
                productId: code.productId,
                variantId: code.variantId,
                count: 1,
              });
            }
          } else if (entry.reloadlyProductId) {
            const resolved = reloadlyResolutions.get(`${item.id}:${index}`);
            if (!resolved) {
              throw new Error("Code Reloadly non résolu.");
            }
            manualCode = resolved.code;
            source = "reloadly";
            reloadlyTransactionId = resolved.transactionId;
            reloadlyOrderId = resolved.reloadlyOrderId;
            deliveredValues.push(resolved.code);
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
              ...(source ? { source } : {}),
              reloadlyTransactionId,
              reloadlyOrderId,
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

    const reference = await publicOrderReference(order);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey: "order_delivered",
        type: "code_delivered",
        variables: {
          customer_name: order.customerName,
          order_number: reference.number,
          delivery_url: absoluteAppUrl(`/delivery/${reference.pathSegment}`),
          total: `${order.totalMad} MAD`,
          codes: deliveredValues.join("\n"),
        },
      });
    } catch (emailError) {
      console.error("[email:order_delivered]", emailError);
    }

    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
    const paymentSummary = await resolveOrderPaymentSummary(order);
    const notifyOrder = { ...order, paymentMethod: paymentSummary.label, bankName: paymentSummary.bankName };
    void notifyPaymentStatusChange({
      order: notifyOrder,
      publicOrderNumber: reference.number,
      fromStatus: "payment_confirmed",
      toStatus: "delivered",
      adminUrl,
    });
    void notifyFulfillmentCompleted({
      order: notifyOrder,
      publicOrderNumber: reference.number,
      adminUrl,
    });

    void checkStockThresholds([...consumedByVariant.values()]);

    return { ok: true };
  } catch (error) {
    console.error("[deliverOrder]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Livraison impossible.",
    };
  }
}

/**
 * The same "is this slot filled" + "cap at item.quantity" logic used for
 * validation, Reloadly pre-resolution, and the delivery transaction — kept
 * in one place so all three stay in sync (they must agree on entry count
 * and ordering for the pre-pass -> transaction correlation below to hold).
 */
function filledEntriesForItem(
  item: { id: string; quantity: number },
  assignments: ItemAssignment[],
): AssignmentEntry[] {
  const assignment = assignments.find((entry) => entry.orderItemId === item.id);
  return (assignment?.codes ?? [])
    .filter((entry) => entry.digitalCodeId || entry.manualCode?.trim() || entry.reloadlyProductId)
    .slice(0, item.quantity);
}

type ResolvedReloadlyEntry = {
  code: string;
  transactionId: number;
  reloadlyOrderId: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatReloadlyCards(cards: ReloadlyGiftCardOrderCard[]): string {
  return cards
    .map((card) => [card.cardNumber, card.pinCode].filter(Boolean).join(" / "))
    .filter(Boolean)
    .join("\n");
}

/**
 * Places one Reloadly order and retrieves its redeem code, retrying the
 * status check briefly if the order isn't immediately SUCCESSFUL (verified
 * live: a normal sandbox order returns SUCCESSFUL synchronously from
 * placeGiftCardOrder(), so this is a safety net, not the common path).
 */
async function resolveReloadlyEntry(input: {
  productId: number;
  countryCode: string;
  unitPrice: number;
  customIdentifier: string;
  recipientEmail: string;
}): Promise<ResolvedReloadlyEntry> {
  const order = await placeGiftCardOrder({
    productId: input.productId,
    countryCode: input.countryCode,
    quantity: 1,
    unitPrice: input.unitPrice,
    customIdentifier: input.customIdentifier,
    senderName: RELOADLY_SENDER_NAME,
    recipientEmail: input.recipientEmail,
  });

  let status = order.status;
  for (
    let attempt = 0;
    status !== "SUCCESSFUL" && status !== "FAILED" && attempt < RELOADLY_STATUS_POLL_ATTEMPTS;
    attempt += 1
  ) {
    await sleep(RELOADLY_STATUS_POLL_DELAY_MS);
    status = (await getGiftCardOrderStatus(order.transactionId)).status;
  }

  if (status !== "SUCCESSFUL") {
    throw new Error(`Commande Reloadly non aboutie (statut: ${status}).`);
  }

  const cards = await getGiftCardOrderCards(order.transactionId);
  const code = formatReloadlyCards(cards);
  if (!code) {
    throw new Error("Reloadly n’a retourné aucun code pour cette commande.");
  }

  return { code, transactionId: order.transactionId, reloadlyOrderId: null };
}

/**
 * Fires low-stock / out-of-stock alerts only on the sale that crosses a
 * threshold, not on every subsequent sale while already below it:
 *  - low_stock fires once when remaining drops from above the threshold to
 *    at-or-below it (and still > 0).
 *  - out_of_stock fires once, separately, when remaining hits exactly 0.
 */
async function checkStockThresholds(
  consumed: { productId: string; variantId: string | null; count: number }[],
): Promise<void> {
  for (const entry of consumed) {
    try {
      const afterCount = await prisma.digitalCode.count({
        where: {
          productId: entry.productId,
          variantId: entry.variantId,
          status: "unused",
        },
      });
      const beforeCount = afterCount + entry.count;

      const crossedIntoLowStock =
        beforeCount > LOW_STOCK_THRESHOLD && afterCount <= LOW_STOCK_THRESHOLD && afterCount > 0;
      const crossedIntoOutOfStock = beforeCount > 0 && afterCount === 0;
      if (!crossedIntoLowStock && !crossedIntoOutOfStock) continue;

      const [product, variant] = await Promise.all([
        prisma.product.findUnique({ where: { id: entry.productId }, select: { name: true } }),
        entry.variantId
          ? prisma.productVariant.findUnique({
              where: { id: entry.variantId },
              select: { name: true, faceValue: true, faceCurrency: true },
            })
          : Promise.resolve(null),
      ]);

      void notifyStockAlert({
        productName: product?.name ?? entry.productId,
        variantName: variant
          ? variant.faceValue != null
            ? `${variant.faceValue} ${variant.faceCurrency}`
            : variant.name
          : undefined,
        remaining: afterCount,
        threshold: LOW_STOCK_THRESHOLD,
        status: crossedIntoOutOfStock ? "out_of_stock" : "low_stock",
      });
    } catch (error) {
      console.error("[stock:threshold-check]", error);
    }
  }
}
