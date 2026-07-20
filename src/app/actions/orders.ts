"use server";

import {
  createOrder,
  getCustomerOrder,
  getOrderSummaries,
  findOrderByEmailAndId,
} from "@/lib/db/orders";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";
import { customerOrderRedirectPath } from "@/lib/orderNumber";
import type { CustomerOrderDTO } from "@/lib/dto";

/** Checkout: create a pending order in the database. Returns the new order id. */
export async function createOrderAction(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  /** Optional: the customer picks the actual method on the payment page. */
  paymentMethod?: string;
  items: { productId: string; quantity: number }[];
  /** Optional promo code applied at checkout (re-validated server-side). */
  promoCode?: string;
  /** Optional Ghost Credit (whole MAD) to spend (re-capped server-side). */
  ghostCreditToApplyMad?: number;
}): Promise<{ id: string; publicOrderNumber: string; publicOrderPathSegment: string } | null> {
  // Global pre-launch guard: never create an order while ordering is disabled.
  // The DB layer re-checks this too, so a race or a direct call can't slip
  // through (see createOrder in src/lib/db/orders.ts).
  if (!(await isOrderingCurrentlyEnabled())) return null;
  return createOrder(input);
}

/** Customer: fetch a single order with its delivered codes. */
export async function getCustomerOrderAction(
  id: string,
): Promise<CustomerOrderDTO | null> {
  return getCustomerOrder(id);
}

/** Customer: fetch summaries for the order ids remembered by this browser. */
export async function getMyOrdersAction(
  ids: string[],
): Promise<CustomerOrderDTO[]> {
  return getOrderSummaries(ids);
}

/**
 * Customer: look up an order by public number + the email used at checkout.
 * Falls back to the internal ID for legacy support links.
 */
export async function findOrderAction(
  orderNumber: string,
  email: string,
): Promise<{ found: boolean; id?: string; redirectTo?: string }> {
  const order = await findOrderByEmailAndId(orderNumber.trim(), email.trim().toLowerCase());
  if (!order) return { found: false };
  // Route via the unguessable delivery token whenever the order has one (the
  // email match already authenticated the guest): it both reveals delivered
  // codes and, for still-unpaid orders, is the only segment a guest can use to
  // reach the payment page now that the enumerable public number no longer
  // authorizes access. Falls back to the public segment only for legacy rows
  // without a token (reachable by the logged-in owner).
  const segment = order.deliveryToken ?? order.publicOrderPathSegment;
  return {
    found: true,
    id: order.id,
    redirectTo: customerOrderRedirectPath(order.status, segment),
  };
}
