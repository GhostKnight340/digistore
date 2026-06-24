"use server";

import {
  createOrder,
  getCustomerOrder,
  getOrderSummaries,
} from "@/lib/db/orders";
import type { CustomerOrderDTO } from "@/lib/dto";

/** Checkout: create a pending order in the database. Returns the new order id. */
export async function createOrderAction(input: {
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  items: { productId: string; quantity: number }[];
}): Promise<{ id: string } | null> {
  try {
    return await createOrder(input);
  } catch (e) {
    console.error("[createOrderAction]", e);
    return null;
  }
}

/** Customer: fetch a single order with its delivered codes. */
export async function getCustomerOrderAction(
  id: string,
): Promise<CustomerOrderDTO | null> {
  try {
    return await getCustomerOrder(id);
  } catch (e) {
    console.error("[getCustomerOrderAction]", e);
    return null;
  }
}

/** Customer: fetch summaries for the order ids remembered by this browser. */
export async function getMyOrdersAction(
  ids: string[],
): Promise<CustomerOrderDTO[]> {
  try {
    return await getOrderSummaries(ids);
  } catch (e) {
    console.error("[getMyOrdersAction]", e);
    return [];
  }
}
