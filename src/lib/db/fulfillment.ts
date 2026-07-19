import "server-only";

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { applyPromoLifecycleForStatus } from "@/lib/db/promoLifecycle";
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
  getSupplierProvider,
  type SupplierPurchaseResult,
  type SupplierSlug,
} from "@/lib/suppliers/registry";
import { isSupplierEnabled, recordSupplierLog } from "@/lib/db/supplierManagement";
import { isSupplierPurchaseUncertain } from "@/lib/suppliers/purchaseOutcome";
import { sendPurchaseEvent } from "@/lib/analytics/purchase";

const LOW_STOCK_THRESHOLD = 3;

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
      // Atomic from-status guard: two concurrent confirmations (double click,
      // admin vs webhook) must not both pass the pre-read check and double-send
      // the confirmation email. Mirrors setPaymentStatus.
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: "payment_confirmed" },
      });
      if (updated.count !== 1) {
        throw new Error("Le statut de la commande a changé entre-temps.");
      }
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
          order_url: absoluteAppUrl(`/order/${order.deliveryToken ?? reference.pathSegment}`),
          total: `${order.totalMad} DH`,
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

    // Finalize promo redemption + grant Ghost Credit now that payment is
    // confirmed. Idempotent and best-effort.
    await applyPromoLifecycleForStatus(orderId, "payment_confirmed");

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
          deliveryToken: true,
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              quantity: true,
              unitPriceMad: true,
              product: { select: { name: true } },
              variant: {
                select: {
                  reloadlyProductId: true,
                  reloadlyCountryCode: true,
                  fazercardsKind: true,
                  fazercardsCategoryId: true,
                  fazercardsOfferId: true,
                  faceValue: true,
                  faceCurrency: true,
                  supplierMappings: {
                    select: {
                      supplier: true,
                      enabled: true,
                      autoFulfillEnabled: true,
                      supplierProductId: true,
                      supplierCategoryId: true,
                      supplierKind: true,
                      supplierRegion: true,
                      lastValidationOk: true,
                    },
                  },
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

  // Resolve any supplier-sourced entries BEFORE opening a DB transaction —
  // these are slow, fallible external HTTP calls (and real wallet spend) and
  // must never happen while a Postgres transaction is held open. If any
  // fails, we abort here with zero DB writes, same as the validation above.
  // All provider specifics live behind the SupplierProvider registry; the
  // only supplier-aware code here is the AssignmentEntry → provider mapping.
  //
  // Interim money-safety guard: purchases run per-entry, sequentially, with
  // no persisted idempotency ledger spanning entries. A partial failure
  // across SEVERAL supplier purchases would re-purchase earlier ones on
  // retry, so multi-code supplier deliveries are refused — fulfil those
  // entries manually instead of risking a double wallet spend.
  const providerEntryCount = order.items.reduce(
    (sum, item) =>
      sum +
      filledEntriesForItem(item, assignments).filter(
        (e) => e.reloadlyProductId || e.fazercards,
      ).length,
    0,
  );
  if (providerEntryCount > 1) {
    return {
      ok: false,
      error:
        "Livraison fournisseur limitée à un code par envoi (protection anti double-achat). Livrez les codes supplémentaires manuellement.",
    };
  }

  const providerResolutions = new Map<
    string,
    { slug: SupplierSlug; result: SupplierPurchaseResult }
  >();
  for (const item of order.items) {
    const entries = filledEntriesForItem(item, assignments);
    for (let index = 0; index < entries.length; index += 1) {
      const request = providerRequestForEntry(entries[index], item);
      if (!request.ok) return { ok: false, error: request.error };
      if (!request.value) continue;

      const { slug, entryParams } = request.value;
      const provider = getSupplierProvider(slug);
      // A disabled supplier must NEVER be used for purchases — the admin
      // switch in /admin/suppliers is enforced here, on the money path.
      if (!(await isSupplierEnabled(slug))) {
        return {
          ok: false,
          error: `${provider.name} est désactivé dans Fournisseurs — réactivez-le ou livrez ce code manuellement.`,
        };
      }
      // Unavailable credentials (or a supplier deliberately disabled outside
      // production, e.g. FazerCards which has no sandbox) must degrade to
      // manual fulfilment, not to a provider exception mid-delivery.
      if (!provider.isConfigured()) {
        return {
          ok: false,
          error: `${provider.name} n’est pas disponible sur cet environnement — livrez ce code manuellement.`,
        };
      }

      const startedAt = Date.now();
      try {
        const result = await provider.purchase({
          // Stable across retries, and the ONLY thing tying a retry to the
          // earlier attempt. How much protection that buys differs per
          // supplier: FazerCards sends it as a real `Idempotency-Key` header
          // (server-enforced replay), while Reloadly has no such header — its
          // `customIdentifier` is only a reference field, so the provider has
          // to look the transaction up before ordering again. Neither is a
          // persisted ledger; a purchase whose outcome is unknown surfaces as
          // SupplierPurchaseUncertainError below rather than being retried.
          idempotencyScope: `${orderId}-${item.id}-${index}`,
          entryParams,
          context: {
            orderId,
            customerEmail: order.customerEmail,
            faceValue: item.variant?.faceValue ?? null,
            faceCurrency: item.variant?.faceCurrency ?? "MAD",
          },
        });
        providerResolutions.set(`${item.id}:${index}`, { slug, result });
        void recordSupplierLog({
          slug,
          requestType: "purchase",
          ok: true,
          responseTimeMs: Date.now() - startedAt,
          orderId,
          productName: item.product?.name ?? null,
          providerRef: result.providerRef,
        });
      } catch (error) {
        console.error(`[deliverOrder:${slug}]`, error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Erreur fournisseur inattendue.";
        // An UNCERTAIN failure (timeout / 5xx / unreachable) may already have
        // been charged. Its message is the reconciliation instruction itself —
        // do NOT wrap it in "Échec de la commande", which reads as "nothing
        // happened, click again" and is exactly the double-spend we guard.
        const uncertain = isSupplierPurchaseUncertain(error);
        void recordSupplierLog({
          slug,
          requestType: "purchase",
          ok: false,
          responseTimeMs: Date.now() - startedAt,
          orderId,
          productName: item.product?.name ?? null,
          errorMessage: uncertain ? `[INCERTAIN] ${message}` : message,
        });
        return {
          ok: false,
          error: uncertain ? message : `Échec de la commande ${provider.name} : ${message}`,
        };
      }
    }
  }

  // Unguessable secret for the delivery-page link, embedded in the "Voir ma
  // livraison" email (never the enumerable public order number). Orders now get
  // this token at creation (it also keys the payment/order pages — see
  // getCustomerOrder() authorization); reuse it so links sent earlier keep
  // working. Legacy pre-token orders mint one here.
  const deliveryToken = order.deliveryToken ?? randomBytes(24).toString("base64url");

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
          let fazercardsOrderId: string | null = null;
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
          } else if (entry.reloadlyProductId || entry.fazercards) {
            const resolved = providerResolutions.get(`${item.id}:${index}`);
            if (!resolved) {
              throw new Error("Code fournisseur non résolu.");
            }
            manualCode = resolved.result.primary;
            source = resolved.slug;
            reloadlyTransactionId = resolved.result.providerRefs.reloadlyTransactionId ?? null;
            reloadlyOrderId = resolved.result.providerRefs.reloadlyOrderId ?? null;
            fazercardsOrderId = resolved.result.providerRefs.fazercardsOrderId ?? null;
            deliveryPayload = resolved.result.fields;
          } else {
            manualCode = entry.manualCode!.trim();
            // A manually-typed code must never be delivered to two different
            // orders (copy/paste mistake or double fulfilment in another tab).
            const duplicate = await tx.deliveredCode.findFirst({
              where: {
                manualCode,
                productId: item.productId,
                orderId: { not: orderId },
              },
              select: { orderId: true },
            });
            if (duplicate) {
              throw new Error(
                "Ce code a déjà été livré sur une autre commande. Vérifiez le code saisi.",
              );
            }
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
              fazercardsOrderId,
              ...(deliveryPayload
                ? { deliveryPayload: deliveryPayload as unknown as Prisma.InputJsonValue }
                : {}),
            },
          });
        }
      }

      // Atomic from-status guard: two concurrent deliveries (double click, two
      // tabs) must not both write DeliveredCode rows and double-send the email.
      // The stock-code claim above already protects DigitalCode rows; this
      // protects manual/Reloadly entries and the status itself.
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "payment_confirmed" },
        data: { status: "delivered", deliveryToken },
      });
      if (updated.count !== 1) {
        throw new Error("La commande a déjà été livrée ou son statut a changé.");
      }
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

    // GA4 `purchase` — fired here, at delivery, because that is the point the
    // business considers the order genuinely complete. Server-side and keyed on
    // the order id (GA4's transaction_id), so a customer refreshing the payment
    // page can never double-count it. Fire-and-forget: never awaited, no-ops
    // without GA_API_SECRET, and must never delay or fail a delivery.
    void sendPurchaseEvent({
      orderId,
      totalMad: order.totalMad,
      items: order.items.map((item) => ({
        item_id: item.variantId ?? item.productId,
        item_name: item.product.name,
        price: item.unitPriceMad,
        quantity: item.quantity,
      })),
    });

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
          total: `${order.totalMad} DH`,
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

    // Provider post-delivery hooks (e.g. Reloadly §10 cost reconciliation).
    // Best-effort, append-only side effects; never affect the delivered order.
    for (const { result } of providerResolutions.values()) {
      try {
        result.afterDelivered?.();
      } catch (hookError) {
        console.error("[deliverOrder:afterDelivered]", hookError);
      }
    }

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
    .filter(
      (entry) =>
        entry.digitalCodeId ||
        entry.manualCode?.trim() ||
        entry.reloadlyProductId ||
        entry.fazercards,
    )
    .slice(0, item.quantity);
}

/**
 * Maps one AssignmentEntry onto a provider purchase request. This is the ONLY
 * supplier-aware branch in fulfillment — everything past it goes through the
 * SupplierProvider registry. Adding a supplier = add its discriminator here
 * and its provider file in src/lib/suppliers/providers/.
 */
type DeliveryVariantMapping = {
  supplier: string;
  enabled: boolean;
  autoFulfillEnabled: boolean;
  supplierProductId: string;
  supplierCategoryId: string | null;
  supplierKind: string | null;
  supplierRegion: string | null;
  lastValidationOk: boolean | null;
};

/** A mapping deliverOrder may purchase from right now (global supplier state
 *  is enforced separately via isSupplierEnabled). */
function usableMapping(
  mappings: DeliveryVariantMapping[] | undefined,
  supplier: SupplierSlug,
): DeliveryVariantMapping | null {
  return (
    mappings?.find(
      (mapping) =>
        mapping.supplier === supplier &&
        mapping.enabled &&
        mapping.autoFulfillEnabled &&
        mapping.lastValidationOk !== false,
    ) ?? null
  );
}

function providerRequestForEntry(
  entry: AssignmentEntry,
  item: {
    variant: {
      reloadlyProductId: number | null;
      reloadlyCountryCode: string | null;
      fazercardsCategoryId: string | null;
      fazercardsOfferId: string | null;
      supplierMappings: DeliveryVariantMapping[];
    } | null;
  },
):
  | { ok: true; value: { slug: SupplierSlug; entryParams: Record<string, unknown> } | null }
  | { ok: false; error: string } {
  const variant = item.variant;
  if (entry.reloadlyProductId) {
    // The entry must match the variant’s CURRENT mapping — a stale admin tab
    // pointing at a re-mapped/disabled variant must not buy the wrong product.
    // Legacy inline columns are only honoured when no mapping rows exist at
    // all (pre-backfill data).
    const mapping = variant ? usableMapping(variant.supplierMappings, "reloadly") : null;
    const mappingProductId = mapping ? Number(mapping.supplierProductId) : null;
    const legacyOk =
      variant &&
      variant.supplierMappings.length === 0 &&
      variant.reloadlyProductId === entry.reloadlyProductId;
    if (!variant || (mappingProductId !== entry.reloadlyProductId && !legacyOk)) {
      return {
        ok: false,
        error: "Configuration Reloadly invalide ou désactivée pour cet article.",
      };
    }
    return {
      ok: true,
      value: {
        slug: "reloadly",
        entryParams: {
          reloadlyProductId: entry.reloadlyProductId,
          reloadlyCountryCode: mapping?.supplierRegion ?? variant.reloadlyCountryCode,
        },
      },
    };
  }
  if (entry.fazercards) {
    const mapping = variant ? usableMapping(variant.supplierMappings, "fazercards") : null;
    const mappingOk =
      mapping &&
      mapping.supplierCategoryId === entry.fazercards.categoryId &&
      mapping.supplierProductId === entry.fazercards.offerId;
    const legacyOk =
      variant &&
      variant.supplierMappings.length === 0 &&
      variant.fazercardsCategoryId === entry.fazercards.categoryId &&
      variant.fazercardsOfferId === entry.fazercards.offerId;
    if (!variant || (!mappingOk && !legacyOk)) {
      return {
        ok: false,
        error: "Configuration FazerCards invalide ou désactivée pour cet article.",
      };
    }
    return { ok: true, value: { slug: "fazercards", entryParams: { fazercards: entry.fazercards } } };
  }
  return { ok: true, value: null };
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
