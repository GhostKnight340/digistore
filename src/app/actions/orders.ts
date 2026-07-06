"use server";

import {
  createOrder,
  getCustomerOrder,
  getOrderSummaries,
  findOrderByEmailAndId,
  type CreateOrderResult,
} from "@/lib/db/orders";
import { customerOrderRedirectPath } from "@/lib/orderNumber";
import type { CustomerOrderDTO } from "@/lib/dto";

/** Checkout: create a pending order in the database. Returns the new order id. */
export async function createOrderAction(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}): Promise<CreateOrderResult> {
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
  return {
    found: true,
    id: order.id,
    redirectTo: customerOrderRedirectPath(order.status, order.publicOrderPathSegment),
  };
}
