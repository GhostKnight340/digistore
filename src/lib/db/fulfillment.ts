import "server-only";

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { publicOrderReference } from "@/lib/db/orders";
import { getStoreSettings } from "@/lib/db/catalog";
import { isInventoryEnabled } from "@/lib/storeSettings";
import { absoluteAppUrl } from "@/lib/orderNumber";
import {
  notifyPaymentStatusChange,
  notifyFulfillmentNeeded,
  notifyFulfillmentCompleted,
  notifyStockAlert,
} from "@/lib/discord/notify";
import { deliverOrderViaDiscord } from "@/lib/discord/dm";
import type { ActionResult, AssignmentEntry, DeliveredFieldDTO, ItemAssignment } from "@/lib/dto";
import {
  placeGiftCardOrder,
  getGiftCardOrderStatus,
  getGiftCardOrderCards,
  getGiftCardProduct,
  validateReloadlyDenomination,
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
    void notifyPaymentStatusChange({
      order,
      publicOrderNumber: reference.number,
      fromStatus: order.status,
      toStatus: "payment_confirmed",
      adminUrl,
    });
    void notifyFulfillmentNeeded({
      order,
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
                  faceCurrency: true,
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
          currency: variant.faceCurrency,
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

  // Unguessable secret for the delivery-page link. Generated once here, at
  // delivery, and embedded in the "Voir ma livraison" email link (never the
  // enumerable public order number). See getCustomerOrder() authorization.
  const deliveryToken = randomBytes(24).toString("base64url");

  try {
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
          let deliveryPayload: DeliveredFieldDTO[] | null = null;

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
            manualCode = resolved.primary;
            source = "reloadly";
            reloadlyTransactionId = resolved.transactionId;
            reloadlyOrderId = resolved.reloadlyOrderId;
            deliveryPayload = resolved.fields;
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
              ...(source ? { source } : {}),
              reloadlyTransactionId,
              reloadlyOrderId,
              ...(deliveryPayload
                ? { deliveryPayload: deliveryPayload as unknown as Prisma.InputJsonValue }
                : {}),
            },
          });
        }
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: "delivered", deliveryToken },
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
          // Token link — the enumerable public order number is never sufficient
          // to reveal codes; the secret token (or logged-in ownership) is.
          delivery_url: absoluteAppUrl(`/delivery/${deliveryToken}`),
          total: `${order.totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:order_delivered]", emailError);
    }

    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
    void notifyPaymentStatusChange({
      order,
      publicOrderNumber: reference.number,
      fromStatus: "payment_confirmed",
      toStatus: "delivered",
      adminUrl,
    });
    void notifyFulfillmentCompleted({
      order,
      publicOrderNumber: reference.number,
      adminUrl,
    });

    // Optional Discord DM of the delivered code(s). Additive convenience only:
    // never throws, never affects the delivered order status (see dm.ts).
    void deliverOrderViaDiscord(orderId);

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
  /** Structured, per-card fields (code / pin / url) — never a malformed join. */
  fields: DeliveredFieldDTO[];
  /** Compact single-value representation kept on DeliveredCode.manualCode for the admin record. */
  primary: string;
  transactionId: number;
  reloadlyOrderId: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Normalizes Reloadly cards into labelled fields by meaning rather than
 * concatenating unrelated values into a malformed string like
 * "https://reloadly.com / 86125test". A URL-shaped cardNumber becomes a
 * redemption link (`url`); otherwise it is the redeem `code`. `pinCode`, when
 * present, is a separate PIN. Only fields that exist are set — payload shape is
 * not assumed to be uniform across products.
 */
function normalizeReloadlyCards(cards: ReloadlyGiftCardOrderCard[]): DeliveredFieldDTO[] {
  return cards
    .map((card) => {
      const field: DeliveredFieldDTO = {};
      const cardNumber = card.cardNumber?.trim();
      const pinCode = card.pinCode?.trim();
      if (cardNumber) {
        if (looksLikeUrl(cardNumber)) field.url = cardNumber;
        else field.code = cardNumber;
      }
      if (pinCode) field.pin = pinCode;
      return field;
    })
    .filter((field) => field.code || field.pin || field.url);
}

/** Compact human-readable value for the admin record (never shown in emails). */
function primaryDeliveryValue(fields: DeliveredFieldDTO[]): string {
  return fields
    .map((field) => field.url ?? field.code ?? field.pin ?? "")
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
  currency: string;
  customIdentifier: string;
  recipientEmail: string;
}): Promise<ResolvedReloadlyEntry> {
  // Pre-flight: confirm the face value is an actually-offered denomination
  // BEFORE spending from the wallet. This turns Reloadly's opaque
  // "400 Invalid price" into a clear, actionable French message and avoids a
  // wasted order attempt.
  const product = await getGiftCardProduct(input.productId);
  const { ok, issues } = validateReloadlyDenomination(product, {
    faceValue: input.unitPrice,
    currency: input.currency,
    countryCode: input.countryCode,
  });
  if (!ok) {
    throw new Error(issues.join(" "));
  }

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
  const fields = normalizeReloadlyCards(cards);
  const primary = primaryDeliveryValue(fields);
  if (fields.length === 0 || !primary) {
    throw new Error("Reloadly n’a retourné aucun code pour cette commande.");
  }

  return { fields, primary, transactionId: order.transactionId, reloadlyOrderId: null };
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
  // No stock system → no low/out-of-stock alerts.
  const settings = await getStoreSettings();
  if (!isInventoryEnabled(settings)) return;
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
