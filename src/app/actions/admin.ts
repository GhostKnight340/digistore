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
  resetCode,
} from "@/lib/db/inventory";
import { confirmPayment, deliverOrder } from "@/lib/db/fulfillment";
import type {
  ActionResult,
  AdminCodeDTO,
  AdminOrderDTO,
  InventoryGroupDTO,
  ItemAssignment,
} from "@/lib/dto";

export async function getAdminOrdersAction(): Promise<AdminOrderDTO[]> {
  try {
    return await getAdminOrders();
  } catch (e) {
    console.error("[getAdminOrdersAction]", e);
    return [];
  }
}

export async function getInventoryAction(): Promise<InventoryGroupDTO[]> {
  try {
    return await getInventoryGroups();
  } catch (e) {
    console.error("[getInventoryAction]", e);
    return [];
  }
}

export async function getAvailableCodesAction(
  productSlug: string,
): Promise<AdminCodeDTO[]> {
  try {
    return await getAvailableCodes(productSlug);
  } catch (e) {
    console.error("[getAvailableCodesAction]", e);
    return [];
  }
}

export async function addCodeAction(
  productSlug: string,
  code: string,
): Promise<ActionResult> {
  try {
    return await addCode(productSlug, code);
  } catch (e) {
    console.error("[addCodeAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}

export async function addCodesBulkAction(
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  try {
    return await addCodesBulk(productSlug, raw);
  } catch (e) {
    console.error("[addCodesBulkAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}

export async function disableCodeAction(
  codeId: string,
): Promise<ActionResult> {
  try {
    return await disableCode(codeId);
  } catch (e) {
    console.error("[disableCodeAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}

export async function resetCodeAction(codeId: string): Promise<ActionResult> {
  try {
    return await resetCode(codeId);
  } catch (e) {
    console.error("[resetCodeAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}

export async function confirmPaymentAction(
  orderId: string,
): Promise<ActionResult> {
  try {
    return await confirmPayment(orderId);
  } catch (e) {
    console.error("[confirmPaymentAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}

export async function deliverOrderAction(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  try {
    return await deliverOrder(orderId, assignments);
  } catch (e) {
    console.error("[deliverOrderAction]", e);
    return { ok: false, error: "Base de données non configurée." };
  }
}
