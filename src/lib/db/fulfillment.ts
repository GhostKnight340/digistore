import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { publicOrderReference } from "@/lib/db/orders";
import { absoluteAppUrl } from "@/lib/orderNumber";
import {
  notifyPaymentStatusChange,
  notifyFulfillmentNeeded,
  notifyFulfillmentCompleted,
  notifyFulfillmentAutoCompleted,
  notifyFulfillmentFailed,
  notifyStockAlert,
} from "@/lib/discord/notify";
import type { ActionResult, AssignmentEntry, ItemAssignment } from "@/lib/dto";
import {
  placeGiftCardOrder,
  getGiftCardOrderStatus,
  getGiftCardOrderCards,
  type ReloadlyGiftCardOrderCard,
} from "@/lib/reloadly/operations";
import { ReloadlyConfigError } from "@/lib/reloadly/client";

const LOW_STOCK_THRESHOLD = 3;
const RELOADLY_SENDER_NAME = "ghost.ma";
const RELOADLY_STATUS_POLL_ATTEMPTS = 3;
const RELOADLY_STATUS_POLL_DELAY_MS = 1500;
const PROCESSING_LOCK_STALE_MS = 2 * 60 * 1000;

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
      orderId,
      publicOrderNumber: reference.number,
      fromStatus: order.status,
      toStatus: "payment_confirmed",
      adminUrl,
    });
    void notifyFulfillmentNeeded({
      orderId,
      publicOrderNumber: reference.number,
      itemCount: await prisma.orderItem.count({ where: { orderId } }),
      adminUrl,
    });
    void attemptAutomaticReloadlyFulfillment(orderId).catch((autoError) =>
      console.error("[attemptAutomaticReloadlyFulfillment]", autoError),
    );

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

  // Units already delivered — by a prior manual delivery, or by the
  // automatic Reloadly pre-pass fired at payment confirmation — must not be
  // asked for again and must not be re-purchased/re-consumed on retry. This
  // is the idempotency guard: only the remaining (quantity - already
  // delivered) units per item are required from `assignments`.
  const deliveredCounts = await countDeliveredByItem(orderId);
  const remainingByItem = new Map<string, number>(
    order.items.map((item) => [item.id, Math.max(0, item.quantity - (deliveredCounts.get(item.id) ?? 0))]),
  );

  for (const item of order.items) {
    const remaining = remainingByItem.get(item.id) ?? 0;
    if (remaining <= 0) continue;
    const entries = filledEntriesForItem(item, assignments, remaining);
    if (entries.length < remaining) {
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
    const remaining = remainingByItem.get(item.id) ?? 0;
    if (remaining <= 0) continue;
    const entries = filledEntriesForItem(item, assignments, remaining);
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
        const remaining = remainingByItem.get(item.id) ?? 0;
        if (remaining <= 0) continue;
        const entries = filledEntriesForItem(item, assignments, remaining);

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

          if (source === "reloadly") {
            await tx.orderItem.update({
              where: { id: item.id },
              data: {
                fulfillmentStatus: "fulfilled",
                fulfillmentSource: "reloadly",
                fulfillmentError: null,
                reloadlyTransactionId,
                reloadlyOrderId,
              },
            });
          }
        }

        if (entries.length > 0) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { fulfillmentStatus: "fulfilled" },
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
    // Include every code delivered for this order, not just this batch —
    // some units may already have been delivered by the automatic Reloadly
    // pre-pass fired at payment confirmation.
    const allDeliveredValues = await allDeliveredCodesForOrder(orderId);

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
          codes: (allDeliveredValues.length ? allDeliveredValues : deliveredValues).join("\n"),
        },
      });
    } catch (emailError) {
      console.error("[email:order_delivered]", emailError);
    }

    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
    void notifyPaymentStatusChange({
      orderId,
      publicOrderNumber: reference.number,
      fromStatus: "payment_confirmed",
      toStatus: "delivered",
      adminUrl,
    });
    void notifyFulfillmentCompleted({
      orderId,
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
 * The same "is this slot filled" + "cap at remaining units" logic used for
 * validation, Reloadly pre-resolution, and the delivery transaction — kept
 * in one place so all three stay in sync (they must agree on entry count
 * and ordering for the pre-pass -> transaction correlation below to hold).
 * `cap` is `item.quantity` minus whatever is already delivered, so admins
 * are only ever asked to fill the units Reloadly automation didn't cover.
 */
function filledEntriesForItem(
  item: { id: string },
  assignments: ItemAssignment[],
  cap: number,
): AssignmentEntry[] {
  const assignment = assignments.find((entry) => entry.orderItemId === item.id);
  return (assignment?.codes ?? [])
    .filter((entry) => entry.digitalCodeId || entry.manualCode?.trim() || entry.reloadlyProductId)
    .slice(0, cap);
}

/** Number of DeliveredCode rows already recorded per order item, of any source. */
async function countDeliveredByItem(orderId: string): Promise<Map<string, number>> {
  const rows = await prisma.deliveredCode.groupBy({
    by: ["orderItemId"],
    where: { orderId },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.orderItemId, row._count._all]));
}

async function allDeliveredCodesForOrder(orderId: string): Promise<string[]> {
  const rows = await prisma.deliveredCode.findMany({
    where: { orderId },
    orderBy: { deliveredAt: "asc" },
    select: { manualCode: true, digitalCode: { select: { code: true } } },
  });
  return rows.map((row) => row.digitalCode?.code ?? row.manualCode ?? "").filter(Boolean);
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

// ─── Automatic Reloadly fulfillment ────────────────────────────────────────
//
// Fired (fire-and-forget, never throws) right after payment confirmation
// (see src/lib/db/payments.ts) and re-runnable from the admin "Retry" button
// on a failed item. Every purchase is preceded by an idempotency check
// against DeliveredCode — a unit that already has a row is never
// re-purchased, whether this is the first automatic attempt, a retry after
// a partial failure, or a race with a concurrent webhook/admin action.

type AutoOrderRecord = {
  id: string;
  status: string;
  createdAt: Date;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  totalMad: number;
  items: {
    id: string;
    productId: string;
    quantity: number;
    displayName: string;
    variant: {
      stockControl: string;
      reloadlyProductId: number | null;
      reloadlyCountryCode: string | null;
      reloadlyAutomationEnabled: boolean;
      faceValue: number | null;
    } | null;
  }[];
};

async function loadAutoOrder(orderId: string): Promise<AutoOrderRecord | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      totalMad: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          product: { select: { name: true } },
          variant: {
            select: {
              name: true,
              faceValue: true,
              faceCurrency: true,
              stockControl: true,
              reloadlyProductId: true,
              reloadlyCountryCode: true,
              reloadlyAutomationEnabled: true,
            },
          },
        },
      },
    },
  });
  if (!order) return null;
  return {
    ...order,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      displayName: item.variant
        ? item.variant.faceValue != null
          ? `${item.product.name} ${item.variant.faceValue} ${item.variant.faceCurrency}`
          : item.variant.name
        : item.product.name,
      variant: item.variant,
    })),
  };
}

/**
 * Purchases the remaining (not-yet-delivered) units of a single order item
 * from Reloadly and persists each one as soon as it succeeds — a later
 * unit failing never loses an earlier unit's purchase. Never throws;
 * returns ok:false with the item left in a "failed" state for manual
 * review/retry. Safe to call repeatedly (idempotent): units already
 * recorded in DeliveredCode are skipped.
 */
async function fulfillOrderItemViaReloadly(
  order: AutoOrderRecord,
  item: AutoOrderRecord["items"][number],
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const variant = item.variant;
  if (!variant || variant.stockControl !== "reloadly") {
    return { ok: false, error: "Variante non mappée à Reloadly." };
  }

  const already = (await countDeliveredByItem(order.id)).get(item.id) ?? 0;
  const remaining = item.quantity - already;
  if (remaining <= 0) {
    if (already >= item.quantity) {
      await prisma.orderItem.updateMany({
        where: { id: item.id, fulfillmentStatus: { not: "fulfilled" } },
        data: { fulfillmentStatus: "fulfilled", fulfillmentSource: "reloadly" },
      });
    }
    return { ok: true, skipped: true };
  }

  if (!variant.reloadlyProductId || !variant.reloadlyCountryCode || variant.faceValue == null) {
    const error = "Configuration Reloadly incomplète pour cette variante.";
    await prisma.orderItem.update({
      where: { id: item.id },
      data: {
        fulfillmentStatus: "failed",
        fulfillmentSource: "reloadly",
        fulfillmentError: error,
        fulfillmentAttempts: { increment: 1 },
        lastFulfillmentAttemptAt: new Date(),
      },
    });
    return { ok: false, error };
  }

  // Claim this item before spending anything, so the automatic pass racing
  // an admin's "Retry" click (or a duplicated webhook) can't both purchase
  // the same units — only one caller wins the update below. A "processing"
  // claim older than PROCESSING_LOCK_STALE_MS is treated as abandoned (e.g.
  // a crashed request) and can be reclaimed, so a failure never permanently
  // bricks the item.
  const staleBefore = new Date(Date.now() - PROCESSING_LOCK_STALE_MS);
  const claim = await prisma.orderItem.updateMany({
    where: {
      id: item.id,
      OR: [
        { fulfillmentStatus: { not: "processing" } },
        { lastFulfillmentAttemptAt: { lt: staleBefore } },
        { lastFulfillmentAttemptAt: null },
      ],
    },
    data: { fulfillmentStatus: "processing", lastFulfillmentAttemptAt: new Date() },
  });
  if (claim.count !== 1) {
    return { ok: false, error: "Une tentative Reloadly est déjà en cours pour cet article." };
  }

  let lastTransactionId: number | null = null;
  let lastReloadlyOrderId: number | null = null;

  for (let unit = 0; unit < remaining; unit += 1) {
    try {
      const resolved = await resolveReloadlyEntry({
        productId: variant.reloadlyProductId,
        countryCode: variant.reloadlyCountryCode,
        unitPrice: variant.faceValue,
        customIdentifier: `${order.id}-${item.id}-${already + unit}`,
        recipientEmail: order.customerEmail,
      });

      await prisma.deliveredCode.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          productId: item.productId,
          manualCode: resolved.code,
          source: "reloadly",
          reloadlyTransactionId: resolved.transactionId,
          reloadlyOrderId: resolved.reloadlyOrderId,
        },
      });
      lastTransactionId = resolved.transactionId;
      lastReloadlyOrderId = resolved.reloadlyOrderId;
    } catch (error) {
      const message =
        error instanceof ReloadlyConfigError
          ? "Reloadly non configuré (variables d'environnement manquantes)."
          : error instanceof Error
            ? error.message
            : "Échec de la commande Reloadly.";
      console.error("[reloadly:auto-fulfill]", { orderId: order.id, orderItemId: item.id, error });
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          fulfillmentStatus: "failed",
          fulfillmentSource: "reloadly",
          fulfillmentError: message,
          fulfillmentAttempts: { increment: 1 },
          lastFulfillmentAttemptAt: new Date(),
          ...(lastTransactionId ? { reloadlyTransactionId: lastTransactionId, reloadlyOrderId: lastReloadlyOrderId } : {}),
        },
      });
      return { ok: false, error: message };
    }
  }

  await prisma.orderItem.update({
    where: { id: item.id },
    data: {
      fulfillmentStatus: "fulfilled",
      fulfillmentSource: "reloadly",
      fulfillmentError: null,
      fulfillmentAttempts: { increment: 1 },
      lastFulfillmentAttemptAt: new Date(),
      reloadlyTransactionId: lastTransactionId,
      reloadlyOrderId: lastReloadlyOrderId,
    },
  });
  return { ok: true };
}

/** If every item in the order now has enough delivered codes, mark it delivered and notify. */
async function finalizeAutoDeliveryIfComplete(order: AutoOrderRecord): Promise<boolean> {
  const current = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
  if (!current || current.status === "delivered") return current?.status === "delivered";

  const deliveredCounts = await countDeliveredByItem(order.id);
  const complete = order.items.every((item) => (deliveredCounts.get(item.id) ?? 0) >= item.quantity);
  if (!complete) return false;

  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: "payment_confirmed" },
    data: { status: "delivered" },
  });
  if (updated.count !== 1) return false;

  await prisma.paymentEvent.create({
    data: {
      orderId: order.id,
      type: "status_change",
      fromStatus: "payment_confirmed",
      toStatus: "delivered",
      note: "Livré automatiquement via Reloadly (sandbox).",
    },
  });

  const reference = await publicOrderReference(order);
  const codes = await allDeliveredCodesForOrder(order.id);

  try {
    await sendTransactionalEmail({
      to: order.customerEmail,
      orderId: order.id,
      customerId: order.customerId,
      templateKey: "order_delivered",
      type: "code_delivered",
      variables: {
        customer_name: order.customerName,
        order_number: reference.number,
        delivery_url: absoluteAppUrl(`/delivery/${reference.pathSegment}`),
        total: `${order.totalMad} MAD`,
        codes: codes.join("\n"),
      },
    });
  } catch (emailError) {
    console.error("[email:order_delivered:auto]", emailError);
  }

  const adminUrl = absoluteAppUrl(`/admin/orders/${order.id}`);
  void notifyPaymentStatusChange({
    orderId: order.id,
    publicOrderNumber: reference.number,
    fromStatus: "payment_confirmed",
    toStatus: "delivered",
    adminUrl,
  });
  void notifyFulfillmentCompleted({ orderId: order.id, publicOrderNumber: reference.number, adminUrl });

  return true;
}

/**
 * Runs right after payment confirmation (PayPal webhook/capture or admin
 * approval — see src/lib/db/payments.ts). For every order item whose
 * variant is mapped to Reloadly with automation enabled, attempts a
 * purchase. Never throws and never breaks the payment-confirmation flow:
 * any failure is caught, recorded on the order item as
 * fulfillmentStatus "failed" with the error message, and surfaced in
 * admin (Discord + order detail) for manual retry or fallback — the order
 * itself is never lost, it just stays at "payment_confirmed" for the
 * admin to finish.
 */
export async function attemptAutomaticReloadlyFulfillment(orderId: string): Promise<void> {
  try {
    await ensureDatabaseReady();
    const order = await loadAutoOrder(orderId);
    if (!order) return;
    // Fire-and-forget: by the time this runs the order may have moved on
    // (refunded, cancelled, already delivered by a concurrent action). Only
    // ever act while it's actually sitting at payment_confirmed.
    if (order.status !== "payment_confirmed") return;

    const eligible = order.items.filter(
      (item) => item.variant?.stockControl === "reloadly" && item.variant.reloadlyAutomationEnabled,
    );
    if (eligible.length === 0) return;

    const reference = await publicOrderReference(order);
    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);

    for (const item of eligible) {
      const result = await fulfillOrderItemViaReloadly(order, item);
      if (result.ok && !result.skipped) {
        void notifyFulfillmentAutoCompleted({
          orderId,
          publicOrderNumber: reference.number,
          itemName: item.displayName,
          adminUrl,
        });
      } else if (!result.ok) {
        void notifyFulfillmentFailed({
          orderId,
          publicOrderNumber: reference.number,
          itemName: item.displayName,
          error: result.error ?? "Erreur inconnue.",
          adminUrl,
        });
      }
    }

    await finalizeAutoDeliveryIfComplete(order);
  } catch (error) {
    console.error("[reloadly:auto-fulfill:order]", orderId, error);
  }
}

/**
 * Admin-triggered retry for a single order item that previously failed
 * automatic Reloadly fulfillment (or a manual "attempt Reloadly now").
 * Same idempotency guarantees as the automatic pass.
 */
export async function retryReloadlyFulfillment(
  orderId: string,
  orderItemId: string,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await loadAutoOrder(orderId);
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.status !== "payment_confirmed") {
    return { ok: false, error: "La commande doit être au statut « paiement confirmé »." };
  }
  const item = order.items.find((row) => row.id === orderItemId);
  if (!item) return { ok: false, error: "Article introuvable." };
  if (item.variant?.stockControl !== "reloadly") {
    return { ok: false, error: "Cet article n’est pas mappé à Reloadly." };
  }

  const result = await fulfillOrderItemViaReloadly(order, item);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Échec de la commande Reloadly." };
  }

  await finalizeAutoDeliveryIfComplete(order);
  return { ok: true };
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
