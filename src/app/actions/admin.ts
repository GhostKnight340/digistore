"use server";

// TODO(auth): These admin actions are UNPROTECTED in this prototype. Before any
// real deployment, gate every function here behind an authenticated admin
// session (e.g. check a server-side session/role) and return 401/403 otherwise.
// Server Actions are publicly invokable endpoints, so without this check any
// visitor could read inventory or deliver orders.

import { revalidatePath } from "next/cache";
import {
  getAdminCustomers,
  getAdminOrderDetail,
  getAdminOrdersPage,
  getAdminOverview,
  getAdminStats,
  getOrderEmailLogs,
} from "@/lib/db/orders";
import {
  getInventoryGroups,
  getInventoryProducts,
  getInventoryCodes,
  getInventorySummary,
  getAvailableCodes,
  addCode,
  addCodesBulk,
  disableCode,
} from "@/lib/db/inventory";
import { confirmPayment, deliverOrder } from "@/lib/db/fulfillment";
import {
  changeOrderStatus,
  clearAllOrders,
  deleteOrder,
} from "@/lib/db/orderManagement";
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
  duplicateParentProduct,
  archiveParentProduct,
  deleteParentProduct,
  convertProductToVariant,
  getFeaturedVariantOptions,
  getParentProducts,
  getParentProductBySlug,
  getProductList,
  saveParentProduct,
  saveVariant,
} from "@/lib/db/products";
import {
  createCategoryQuick,
  deleteCategory,
  getAdminCategories,
  getCategoryOptions,
  reorderCategories,
  saveCategory,
} from "@/lib/db/categories";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { getEmailDiagnostics, type EmailDiagnostics } from "@/lib/email/config";
import type { EmailTemplateKey } from "@/lib/emailTemplates";
import type {
  ActionResult,
  AdminCategoryDTO,
  AdminCodeDTO,
  AdminOverviewDTO,
  CustomerDTO,
  AdminOrderDTO,
  AdminOrderSummaryDTO,
  AdminStatsDTO,
  EmailLogDTO,
  FeaturedVariantOptionDTO,
  InventoryGroupDTO,
  InventoryProductDTO,
  InventorySummaryDTO,
  ItemAssignment,
  ConvertProductToVariantInput,
  DeleteParentProductInput,
  ParentProductDTO,
  ProductListItemDTO,
  SaveCategoryInput,
  SaveParentProductInput,
  SaveVariantInput,
} from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

function revalidateStorefrontCatalog() {
  revalidatePath("/", "layout");
  revalidatePath("/", "page");
  revalidatePath("/products", "page");
  revalidatePath("/products/[id]", "page");
}

export async function getAdminOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  return getAdminOrdersPage({ take: 10 });
}

/**
 * Secret-safe email/Resend configuration diagnostic for the admin panel.
 * Never returns the API key value — only whether each setting is present.
 */
export async function getEmailDiagnosticsAction(): Promise<EmailDiagnostics> {
  return getEmailDiagnostics();
}

export async function sendTestEmailAction(
  to: string,
  templateKey: EmailTemplateKey,
): Promise<ActionResult> {
  const recipient = to.trim();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, error: "Adresse email invalide." };
  }
  const result = await sendTransactionalEmail({
    to: recipient,
    templateKey,
    type: "test_email",
    variables: {
      customer_name: "Client test",
      order_number: "#TEST",
      order_url: "https://ghost.ma/order/test",
      payment_url: "https://ghost.ma/payment/test",
      delivery_url: "https://ghost.ma/delivery/test",
      total: "100 MAD",
      reason: "Test admin",
    },
    metadata: { source: "admin_test_email" },
    manuallyEdited: false,
  });
  return result.ok
    ? { ok: true }
    : { ok: false, error: result.error ?? "Envoi email impossible." };
}

export async function getAdminPaymentOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  return getAdminOrdersPage({
    take: 50,
    statuses: [
      "payment_submitted",
      "payment_confirmed",
      "payment_issue",
      "rejected",
      "delivered",
    ],
  });
}

export async function getAdminFulfillmentOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  return getAdminOrdersPage({ take: 100 });
}

export async function getAdminOverviewAction(): Promise<AdminOverviewDTO> {
  return getAdminOverview();
}

export async function getAdminOrderDetailAction(orderId: string): Promise<AdminOrderDTO | null> {
  return getAdminOrderDetail(orderId);
}

export async function getAdminCustomersAction(): Promise<CustomerDTO[]> {
  return getAdminCustomers();
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

export async function getInventoryProductsAction(): Promise<InventoryProductDTO[]> {
  return getInventoryProducts();
}

export async function getInventoryCodesAction(productSlug: string): Promise<AdminCodeDTO[]> {
  return getInventoryCodes(productSlug);
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

export async function changeOrderStatusAction(
  orderId: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<ActionResult> {
  const result = await changeOrderStatus({ orderId, toStatus, note });
  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/payment/${orderId}`);
  }
  return result;
}

export async function deleteOrderAction(orderId: string): Promise<ActionResult> {
  const result = await deleteOrder(orderId);
  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${orderId}`);
  }
  return result;
}

export async function clearAllOrdersAction(
  resetOrderNumbering: boolean,
): Promise<ActionResult> {
  const result = await clearAllOrders(resetOrderNumbering);
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function getParentProductsAction(): Promise<ParentProductDTO[]> {
  return getParentProducts();
}

export async function getProductListAction(): Promise<ProductListItemDTO[]> {
  return getProductList();
}

export async function getAdminCategoriesAction(): Promise<AdminCategoryDTO[]> {
  return getAdminCategories();
}

export async function getCategoryOptionsAction(): Promise<AdminCategoryDTO[]> {
  return getCategoryOptions();
}

export async function createCategoryQuickAction(
  nameOrSlug: string,
): Promise<ActionResult & { category?: AdminCategoryDTO }> {
  const result = await createCategoryQuick(nameOrSlug);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function saveCategoryAction(
  data: SaveCategoryInput,
): Promise<ActionResult & { category?: AdminCategoryDTO }> {
  const result = await saveCategory(data);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function reorderCategoriesAction(ids: string[]): Promise<ActionResult> {
  const result = await reorderCategories(ids);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const result = await deleteCategory(id);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function getParentProductBySlugAction(slug: string): Promise<ParentProductDTO | null> {
  return getParentProductBySlug(slug);
}

export async function getFeaturedVariantOptionsAction(): Promise<FeaturedVariantOptionDTO[]> {
  return getFeaturedVariantOptions();
}

export async function saveParentProductAction(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  const result = await saveParentProduct(data);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function duplicateParentProductAction(
  slug: string,
): Promise<ActionResult & { slug?: string }> {
  const result = await duplicateParentProduct(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function archiveParentProductAction(slug: string): Promise<ActionResult> {
  const result = await archiveParentProduct(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function deleteParentProductAction(
  input: DeleteParentProductInput,
): Promise<ActionResult> {
  const result = await deleteParentProduct(input);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function convertProductToVariantAction(
  input: ConvertProductToVariantInput,
): Promise<ActionResult> {
  const result = await convertProductToVariant(input);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function saveVariantAction(
  data: SaveVariantInput,
): Promise<ActionResult> {
  const result = await saveVariant(data);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function deleteVariantAction(slug: string): Promise<ActionResult> {
  const result = await deleteVariant(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function duplicateVariantAction(
  variantId: string,
): Promise<ActionResult & { slug?: string }> {
  const result = await duplicateVariant(variantId);
  if (result.ok) revalidateStorefrontCatalog();
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
