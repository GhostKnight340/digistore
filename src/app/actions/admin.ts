"use server";

// TODO(auth): These admin actions are UNPROTECTED in this prototype. Before any
// real deployment, gate every function here behind an authenticated admin
// session (e.g. check a server-side session/role) and return 401/403 otherwise.
// Server Actions are publicly invokable endpoints, so without this check any
// visitor could read inventory or deliver orders.

import { getAdminOrders } from "@/lib/db/orders";
import {
  getInventoryGroups,
  getAvailableCodes,
  addCode,
  addCodesBulk,
  disableCode,
} from "@/lib/db/inventory";
import { confirmPayment, deliverOrder } from "@/lib/db/fulfillment";
import {
  getParentProducts,
  saveParentProduct,
  saveVariant,
} from "@/lib/db/products";
import type {
  ActionResult,
  AdminCodeDTO,
  AdminOrderDTO,
  InventoryGroupDTO,
  ItemAssignment,
  ParentProductDTO,
  SaveParentProductInput,
  SaveVariantInput,
} from "@/lib/dto";

export async function getAdminOrdersAction(): Promise<AdminOrderDTO[]> {
  return getAdminOrders();
}

export async function getInventoryAction(): Promise<InventoryGroupDTO[]> {
  return getInventoryGroups();
}

export async function getAvailableCodesAction(
  productSlug: string,
): Promise<AdminCodeDTO[]> {
  return getAvailableCodes(productSlug);
}

export async function addCodeAction(
  productSlug: string,
  code: string,
): Promise<ActionResult> {
  return addCode(productSlug, code);
}

export async function addCodesBulkAction(
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  return addCodesBulk(productSlug, raw);
}

export async function disableCodeAction(
  codeId: string,
): Promise<ActionResult> {
  return disableCode(codeId);
}

export async function confirmPaymentAction(
  orderId: string,
): Promise<ActionResult> {
  return confirmPayment(orderId);
}

export async function deliverOrderAction(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  return deliverOrder(orderId, assignments);
}

export async function getParentProductsAction(): Promise<ParentProductDTO[]> {
  return getParentProducts();
}

export async function saveParentProductAction(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  return saveParentProduct(data);
}

export async function saveVariantAction(
  data: SaveVariantInput,
): Promise<ActionResult> {
  return saveVariant(data);
}
