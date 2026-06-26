"use server";

import {
  createOrder,
  getCustomerOrder,
  getOrderSummaries,
  findOrderByEmailAndId,
} from "@/lib/db/orders";
import type { CustomerOrderDTO } from "@/lib/dto";

/** Checkout: create a pending order in the database. Returns the new order id. */
export async function createOrderAction(input: {
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}): Promise<{ id: string } | null> {
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
 * Customer: look up an order by its ID + the email used at checkout.
 * Returns the order ID on match so the client can redirect to /payment/{id}.
 */
export async function findOrderAction(
  orderId: string,
  email: string,
): Promise<{ found: boolean; id?: string }> {
  const order = await findOrderByEmailAndId(orderId.trim(), email.trim().toLowerCase());
  if (!order) return { found: false };
  return { found: true, id: order.id };
}
