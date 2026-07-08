/**
 * Business logic gluing Ghost orders to PayPal. Every function here re-reads
 * trusted state from PayPal's API (never the client, never an unverified
 * webhook payload) before it ever changes a Ghost order's payment status.
 */
import "server-only";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { resolveOrderReference } from "@/lib/db/orders";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";
import {
  savePaypalOrderCreated,
  confirmPaypalPayment,
  markPaypalCaptureDenied,
  markPaypalRefunded,
} from "@/lib/db/payments";
import { amountsRoughlyEqual, computePayPalAmount } from "./amount";
import {
  createPayPalOrder,
  getPayPalOrder,
  capturePayPalOrder,
  getPayPalCapture,
  PayPalApiError,
  PayPalConfigError,
  type PayPalOrder,
} from "./client";
import type { ActionResult } from "@/lib/dto";

function describePaypalError(error: unknown): string {
  if (error instanceof PayPalApiError) return `PayPalApiError(${error.status}): ${error.message}`;
  if (error instanceof PayPalConfigError) return `PayPalConfigError: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export interface CreatePaypalOrderResult {
  ok: boolean;
  error?: string;
  paypalOrderId?: string;
  currency?: string;
  value?: string;
}

/** Creates (or safely reuses) a PayPal order for a pending Ghost order. */
export async function createPaypalOrderForGhostOrder(
  orderRef: string,
): Promise<CreatePaypalOrderResult> {
  await ensureDatabaseReady();
  const orderId = await resolveOrderReference(orderRef);
  if (!orderId) return { ok: false, error: "Commande introuvable." };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Commande introuvable." };

  if (order.status !== "pending_payment") {
    return { ok: false, error: "Cette commande n'est plus en attente de paiement." };
  }

  const { methods } = await getAdminPaymentMethods();
  const method = resolveOrderPaymentMethod(order.paymentMethod, methods);
  // "card" is guest checkout through PayPal's own card processing — same
  // backend, just a different button/funding source client-side.
  if (!method || (method.type !== "paypal" && method.type !== "card")) {
    return { ok: false, error: "PayPal n'est pas disponible pour cette commande." };
  }
  if (method.type === "card" && method.details.comingSoon) {
    return { ok: false, error: "Le paiement par carte n'est pas encore disponible." };
  }

  // Idempotent: reuse the existing PayPal order if one was already created
  // and is still open (customer refreshed the page / re-clicked the button).
  if (order.paymentProviderOrderId) {
    try {
      const existing = await getPayPalOrder(order.paymentProviderOrderId);
      if (existing.status === "CREATED" || existing.status === "APPROVED") {
        return {
          ok: true,
          paypalOrderId: existing.id,
          currency: order.paymentProviderCurrency ?? undefined,
          value:
            order.paymentProviderAmount != null ? order.paymentProviderAmount.toFixed(2) : undefined,
        };
      }
      if (existing.status === "COMPLETED") {
        return { ok: false, error: "Cette commande a déjà été payée." };
      }
    } catch (error) {
      console.error("[paypal:reuseOrder]", describePaypalError(error));
      // Fall through and create a fresh PayPal order.
    }
  }

  const amount = computePayPalAmount(order.totalMad, method.details);

  try {
    const created = await createPayPalOrder({
      ghostOrderId: order.id,
      amountValue: amount.value,
      currency: amount.currency,
      description: "Commande Ghost",
    });

    const saved = await savePaypalOrderCreated(order.id, {
      paypalOrderId: created.id,
      amountValue: amount.value,
      currency: amount.currency,
    });
    if (!saved.ok) return { ok: false, error: saved.error };

    return { ok: true, paypalOrderId: created.id, currency: amount.currency, value: amount.value };
  } catch (error) {
    console.error("[paypal:createOrder]", describePaypalError(error));
    return { ok: false, error: "Impossible de créer le paiement PayPal." };
  }
}

/**
 * Applies a PayPal order's *server-fetched* state to the matching Ghost
 * order. Shared by the browser capture action and the webhook handler so
 * both paths go through the exact same amount-verification + idempotent
 * status transition.
 */
export async function applyVerifiedPaypalOrder(
  ghostOrderId: string,
  paypalOrder: PayPalOrder,
): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: ghostOrderId } });
  if (!order) return { ok: false, error: "Commande introuvable." };

  const purchaseUnit = paypalOrder.purchase_units?.[0];
  if (purchaseUnit?.custom_id && purchaseUnit.custom_id !== ghostOrderId) {
    return { ok: false, error: "Incohérence entre la commande PayPal et la commande Ghost." };
  }
  if (order.paymentProviderOrderId && order.paymentProviderOrderId !== paypalOrder.id) {
    return { ok: false, error: "Incohérence entre la commande PayPal et la commande Ghost." };
  }

  const capture = purchaseUnit?.payments?.captures?.[0];

  if (paypalOrder.status === "COMPLETED" && capture && capture.status === "COMPLETED") {
    if (order.paymentProviderCurrency && order.paymentProviderAmount != null) {
      const expected = {
        value: order.paymentProviderAmount.toFixed(2),
        currency: order.paymentProviderCurrency,
      };
      const actual = { value: capture.amount.value, currency: capture.amount.currency_code };
      if (!amountsRoughlyEqual(expected, actual)) {
        console.error("[paypal] amount mismatch", {
          ghostOrderId,
          expectedCurrency: expected.currency,
          actualCurrency: actual.currency,
        });
        return { ok: false, error: "Le montant PayPal ne correspond pas au montant de la commande." };
      }
    }
    return confirmPaypalPayment(ghostOrderId, {
      captureId: capture.id,
      rawStatus: capture.status,
      amountValue: capture.amount.value,
      currency: capture.amount.currency_code,
    });
  }

  if (capture && (capture.status === "DECLINED" || capture.status === "FAILED")) {
    return markPaypalCaptureDenied(ghostOrderId, capture.status);
  }

  // CREATED / APPROVED / PENDING — approved-but-not-captured yet; nothing to
  // confirm. Not an error: the browser capture call or a later webhook will
  // finish the job.
  return { ok: true };
}

export interface CapturePaypalOrderResult {
  ok: boolean;
  error?: string;
  status?: "confirmed" | "pending_review";
}

/** Captures a customer-approved PayPal order and confirms payment on success. */
export async function capturePaypalOrderForGhostOrder(
  orderRef: string,
  paypalOrderId: string,
): Promise<CapturePaypalOrderResult> {
  await ensureDatabaseReady();
  const orderId = await resolveOrderReference(orderRef);
  if (!orderId) return { ok: false, error: "Commande introuvable." };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Commande introuvable." };

  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: true, status: "confirmed" };
  }

  if (!paypalOrderId || !order.paymentProviderOrderId || order.paymentProviderOrderId !== paypalOrderId) {
    return { ok: false, error: "Référence de paiement PayPal invalide." };
  }

  let captured: PayPalOrder;
  try {
    captured = await capturePayPalOrder(paypalOrderId);
  } catch (error) {
    console.error("[paypal:capture]", describePaypalError(error));
    return {
      ok: false,
      error: "La capture du paiement PayPal a échoué. Réessayez ou contactez le support.",
    };
  }

  const applied = await applyVerifiedPaypalOrder(order.id, captured);
  if (!applied.ok) {
    return { ok: false, error: applied.error ?? "La capture n'a pas pu être confirmée." };
  }

  const captureStatus = captured.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  return { ok: true, status: captureStatus === "COMPLETED" ? "confirmed" : "pending_review" };
}

/** Looks up the Ghost order id that owns a given PayPal order id. */
export async function findGhostOrderIdByPaypalOrderId(paypalOrderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { paymentProviderOrderId: paypalOrderId },
    select: { id: true },
  });
  return order?.id ?? null;
}

/** Looks up the Ghost order id that owns a given PayPal capture id. */
export async function findGhostOrderIdByCaptureId(captureId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { paymentProviderCaptureId: captureId },
    select: { id: true },
  });
  return order?.id ?? null;
}

/** Re-fetches a capture from PayPal (trusted) and marks the order refunded. */
export async function reconcileRefundedCapture(captureId: string): Promise<ActionResult> {
  const ghostOrderId = await findGhostOrderIdByCaptureId(captureId);
  if (!ghostOrderId) return { ok: true }; // Unknown/foreign capture — nothing to do.

  try {
    const capture = await getPayPalCapture(captureId);
    if (capture.status !== "REFUNDED") return { ok: true };
  } catch (error) {
    console.error("[paypal:reconcileRefund]", describePaypalError(error));
    return { ok: false, error: "Impossible de vérifier le remboursement PayPal." };
  }

  return markPaypalRefunded(ghostOrderId, "REFUNDED");
}
