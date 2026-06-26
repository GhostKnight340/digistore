"use server";

// TODO(auth): These admin actions are UNPROTECTED in this prototype. Before any
// real deployment, gate every function here behind an authenticated admin
// session (e.g. check a server-side session/role) and return 401/403 otherwise.
// Server Actions are publicly invokable endpoints, so without this check any
// visitor could read inventory or deliver orders.

import { revalidatePath } from "next/cache";
import { getAdminOrders, getOrderEmailLogs, getAdminStats } from "@/lib/db/orders";
import {
  getInventoryGroups,
  getInventorySummary,
  getAvailableCodes,
  addCode,
  addCodesBulk,
  disableCode,
} from "@/lib/db/inventory";
import { confirmPayment, deliverOrder } from "@/lib/db/fulfillment";
import {
  updateMethodConfig,
  updateSupportConfig,
  addBank,
  updateBank,
  deleteBank,
  addWallet,
  updateWallet,
  deleteWallet,
} from "@/lib/db/paymentSettings";
import {
  deleteVariant,
  duplicateVariant,
  getParentProducts,
  getParentProductBySlug,
  getProductList,
  saveParentProduct,
  saveVariant,
} from "@/lib/db/products";
import type {
  ActionResult,
  AdminCodeDTO,
  AdminOrderDTO,
  AdminStatsDTO,
  EmailLogDTO,
  InventoryGroupDTO,
  InventorySummaryDTO,
  ItemAssignment,
  ParentProductDTO,
  ProductListItemDTO,
  SaveParentProductInput,
  SaveVariantInput,
} from "@/lib/dto";

export async function getAdminOrdersAction(): Promise<AdminOrderDTO[]> {
  return getAdminOrders();
}

export async function getOrderEmailLogsAction(orderId: string): Promise<EmailLogDTO[]> {
  return getOrderEmailLogs(orderId);
}

export async function getAdminStatsAction(): Promise<AdminStatsDTO> {
  return getAdminStats();
}

export async function getInventoryAction(): Promise<InventoryGroupDTO[]> {
  return getInventoryGroups();
}

export async function getInventorySummaryAction(): Promise<InventorySummaryDTO[]> {
  return getInventorySummary();
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

export async function getProductListAction(): Promise<ProductListItemDTO[]> {
  return getProductList();
}

export async function getParentProductBySlugAction(slug: string): Promise<ParentProductDTO | null> {
  return getParentProductBySlug(slug);
}

export async function saveParentProductAction(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  const result = await saveParentProduct(data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function saveVariantAction(
  data: SaveVariantInput,
): Promise<ActionResult> {
  const result = await saveVariant(data);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function deleteVariantAction(slug: string): Promise<ActionResult> {
  const result = await deleteVariant(slug);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function duplicateVariantAction(
  variantId: string,
): Promise<ActionResult & { slug?: string }> {
  const result = await duplicateVariant(variantId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// ─── Payment settings admin actions ───────────────────────────────────────────

export async function updateMethodConfigAction(
  method: string,
  data: Partial<{
    enabled: boolean;
    proofRequired: boolean;
    paypalEmail: string;
    cardMessage: string;
    instructions: string;
  }>,
): Promise<ActionResult> {
  return updateMethodConfig(method, data);
}

export async function updateSupportConfigAction(data: {
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}): Promise<ActionResult> {
  return updateSupportConfig(data);
}

export async function addBankAction(data: {
  name: string;
  accountHolder: string;
  accountNumber: string;
  rib: string;
  iban: string;
  swift: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  return addBank(data);
}

export async function updateBankAction(
  id: string,
  data: Partial<{
    name: string;
    accountHolder: string;
    accountNumber: string;
    rib: string;
    iban: string;
    swift: string;
    instructions: string;
    enabled: boolean;
    sortOrder: number;
  }>,
): Promise<ActionResult> {
  return updateBank(id, data);
}

export async function deleteBankAction(id: string): Promise<ActionResult> {
  return deleteBank(id);
}

export async function addWalletAction(data: {
  network: string;
  address: string;
  label: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  return addWallet(data);
}

export async function updateWalletAction(
  id: string,
  data: Partial<{
    network: string;
    address: string;
    label: string;
    instructions: string;
    enabled: boolean;
  }>,
): Promise<ActionResult> {
  return updateWallet(id, data);
}

export async function deleteWalletAction(id: string): Promise<ActionResult> {
  return deleteWallet(id);
}
