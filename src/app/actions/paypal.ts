"use server";

import {
  createPaypalOrderForGhostOrder,
  capturePaypalOrderForGhostOrder,
  type CreatePaypalOrderResult,
  type CapturePaypalOrderResult,
} from "@/lib/paypal/operations";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";
import { ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";

/**
 * Customer: create a PayPal order for a Ghost order (pending_payment only).
 * Never runs client-side — this is the only place allowed to talk to
 * PayPal's Orders API on behalf of the browser, so secrets never leave the
 * server.
 */
export async function createPaypalOrderAction(orderId: string): Promise<CreatePaypalOrderResult> {
  // Pre-launch guard: no PayPal/card payment while ordering is disabled.
  if (!(await isOrderingCurrentlyEnabled())) {
    return { ok: false, error: ORDERS_UNAVAILABLE_COPY.title };
  }
  if (!orderId || typeof orderId !== "string") {
    return { ok: false, error: "Commande introuvable." };
  }
  return createPaypalOrderForGhostOrder(orderId);
}

/**
 * Customer: capture a PayPal order the customer just approved. Only a
 * successful server-side capture (verified against PayPal's API) can mark
 * the Ghost order paid — the browser's "approved" callback alone is never
 * trusted.
 */
export async function capturePaypalOrderAction(
  orderId: string,
  paypalOrderId: string,
): Promise<CapturePaypalOrderResult> {
  // Pre-launch guard: refuse to capture/settle a payment while ordering is off.
  if (!(await isOrderingCurrentlyEnabled())) {
    return { ok: false, error: ORDERS_UNAVAILABLE_COPY.title };
  }
  if (!orderId || typeof orderId !== "string" || !paypalOrderId || typeof paypalOrderId !== "string") {
    return { ok: false, error: "Requête invalide." };
  }
  return capturePaypalOrderForGhostOrder(orderId, paypalOrderId);
}
