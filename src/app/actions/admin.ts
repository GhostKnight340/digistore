"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  getAdminCustomers,
  getAdminOrderDetail,
  getAdminOrdersPage,
  getAdminNavCounts,
  getAdminOverview,
  getAdminOverviewMetrics,
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
import { renderTransactionalEmail, sendTransactionalEmail } from "@/lib/email/send-email";
import type { EmailTemplateKey, RenderedEmailTemplate } from "@/lib/emailTemplates";
import { emailTemplateSampleVariables } from "@/lib/emailSampleData";
import { mergeStoreSettings } from "@/lib/storeSettings";
import type {
  ActionResult,
  AdminCategoryDTO,
  AdminCodeDTO,
  AdminOverviewDTO,
  AdminOverviewMetricsDTO,
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

async function assertAdminAccess() {
  await requireAdminCustomer();
}

function revalidateStorefrontCatalog() {
  revalidatePath("/", "layout");
  revalidatePath("/", "page");
  revalidatePath("/products", "page");
  revalidatePath("/products/[id]", "page");
}

export async function getAdminOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  await assertAdminAccess();
  return getAdminOrdersPage({ take: 10 });
}

export async function previewEmailTemplateAction(
  templateKey: EmailTemplateKey,
  draftSettings: unknown,
): Promise<ActionResult & { preview?: RenderedEmailTemplate }> {
  await assertAdminAccess();
  try {
    const settings = mergeStoreSettings(draftSettings);
    const preview = await renderTransactionalEmail(
      templateKey,
      emailTemplateSampleVariables(),
      {},
      settings,
    );
    return { ok: true, preview };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Aperçu impossible.",
    };
  }
}

export async function sendTestEmailAction(
  to: string,
  templateKey: EmailTemplateKey,
  draftSettings?: unknown,
): Promise<ActionResult> {
  await assertAdminAccess();
  const recipient = to.trim();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, error: "Adresse email invalide." };
  }
  const result = await sendTransactionalEmail({
    to: recipient,
    templateKey,
    type: "test_email",
    variables: emailTemplateSampleVariables(),
    metadata: { source: "admin_test_email" },
    manuallyEdited: false,
    settingsOverride: draftSettings ? mergeStoreSettings(draftSettings) : undefined,
  });
  return result.ok
    ? { ok: true }
    : { ok: false, error: result.error ?? "Envoi email impossible." };
}

export async function getAdminPaymentOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  await assertAdminAccess();
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
  await assertAdminAccess();
  return getAdminOrdersPage({ take: 100 });
}

export async function getAdminNavCountsAction(): Promise<{
  activeOrders: number;
  paymentReview: number;
}> {
  await assertAdminAccess();
  return getAdminNavCounts();
}

export async function getAdminOverviewAction(): Promise<AdminOverviewDTO> {
  await assertAdminAccess();
  return getAdminOverview();
}

export async function getAdminOverviewMetricsAction(): Promise<AdminOverviewMetricsDTO> {
  await assertAdminAccess();
  return getAdminOverviewMetrics();
}

export async function getAdminOrderDetailAction(orderId: string): Promise<AdminOrderDTO | null> {
  await assertAdminAccess();
  return getAdminOrderDetail(orderId);
}

export async function getAdminCustomersAction(): Promise<CustomerDTO[]> {
  await assertAdminAccess();
  return getAdminCustomers();
}

export async function getOrderEmailLogsAction(orderId: string): Promise<EmailLogDTO[]> {
  await assertAdminAccess();
  return getOrderEmailLogs(orderId);
}

export async function getAdminStatsAction(): Promise<AdminStatsDTO> {
  await assertAdminAccess();
  return getAdminStats();
}

export async function getInventoryAction(): Promise<InventoryGroupDTO[]> {
  await assertAdminAccess();
  return getInventoryGroups();
}

export async function getInventoryProductsAction(): Promise<InventoryProductDTO[]> {
  await assertAdminAccess();
  return getInventoryProducts();
}

export async function getInventoryCodesAction(productSlug: string): Promise<AdminCodeDTO[]> {
  await assertAdminAccess();
  return getInventoryCodes(productSlug);
}

export async function getInventorySummaryAction(): Promise<InventorySummaryDTO[]> {
  await assertAdminAccess();
  return getInventorySummary();
}

export async function getAvailableCodesAction(
  productSlug: string,
): Promise<AdminCodeDTO[]> {
  await assertAdminAccess();
  return getAvailableCodes(productSlug);
}

export async function addCodeAction(
  productSlug: string,
  code: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  return addCode(productSlug, code);
}

export async function addCodesBulkAction(
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  await assertAdminAccess();
  return addCodesBulk(productSlug, raw);
}

export async function disableCodeAction(
  codeId: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  return disableCode(codeId);
}

export async function confirmPaymentAction(
  orderId: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  return confirmPayment(orderId);
}

export async function deliverOrderAction(
  orderId: string,
  assignments: ItemAssignment[],
): Promise<ActionResult> {
  await assertAdminAccess();
  return deliverOrder(orderId, assignments);
}

export async function changeOrderStatusAction(
  orderId: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await changeOrderStatus({ orderId, toStatus, note });
  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/payment/${orderId}`);
  }
  return result;
}

export async function deleteOrderAction(orderId: string): Promise<ActionResult> {
  await assertAdminAccess();
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
  await assertAdminAccess();
  const result = await clearAllOrders(resetOrderNumbering);
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function getParentProductsAction(): Promise<ParentProductDTO[]> {
  await assertAdminAccess();
  return getParentProducts();
}

export async function getProductListAction(): Promise<ProductListItemDTO[]> {
  await assertAdminAccess();
  return getProductList();
}

export async function getAdminCategoriesAction(): Promise<AdminCategoryDTO[]> {
  await assertAdminAccess();
  return getAdminCategories();
}

export async function getCategoryOptionsAction(): Promise<AdminCategoryDTO[]> {
  await assertAdminAccess();
  return getCategoryOptions();
}

export async function createCategoryQuickAction(
  nameOrSlug: string,
): Promise<ActionResult & { category?: AdminCategoryDTO }> {
  await assertAdminAccess();
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
  await assertAdminAccess();
  const result = await saveCategory(data);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function reorderCategoriesAction(ids: string[]): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await reorderCategories(ids);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await deleteCategory(id);
  if (result.ok) {
    revalidateStorefrontCatalog();
    revalidatePath("/admin");
  }
  return result;
}

export async function getParentProductBySlugAction(slug: string): Promise<ParentProductDTO | null> {
  await assertAdminAccess();
  return getParentProductBySlug(slug);
}

export async function getFeaturedVariantOptionsAction(): Promise<FeaturedVariantOptionDTO[]> {
  await assertAdminAccess();
  return getFeaturedVariantOptions();
}

export async function saveParentProductAction(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await saveParentProduct(data);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function duplicateParentProductAction(
  slug: string,
): Promise<ActionResult & { slug?: string }> {
  await assertAdminAccess();
  const result = await duplicateParentProduct(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function archiveParentProductAction(slug: string): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await archiveParentProduct(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function deleteParentProductAction(
  input: DeleteParentProductInput,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await deleteParentProduct(input);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function convertProductToVariantAction(
  input: ConvertProductToVariantInput,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await convertProductToVariant(input);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function saveVariantAction(
  data: SaveVariantInput,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await saveVariant(data);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function deleteVariantAction(slug: string): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await deleteVariant(slug);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

export async function duplicateVariantAction(
  variantId: string,
): Promise<ActionResult & { slug?: string }> {
  await assertAdminAccess();
  const result = await duplicateVariant(variantId);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

// â”€â”€â”€ Payment settings admin actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  await assertAdminAccess();
  return updateMethodConfig(method, data);
}

export async function updateSupportConfigAction(data: {
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}): Promise<ActionResult> {
  await assertAdminAccess();
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
  await assertAdminAccess();
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
  await assertAdminAccess();
  return updateBank(id, data);
}

export async function deleteBankAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  return deleteBank(id);
}

export async function addWalletAction(data: {
  network: string;
  address: string;
  label: string;
  instructions: string;
}): Promise<ActionResult & { id?: string }> {
  await assertAdminAccess();
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
  await assertAdminAccess();
  return updateWallet(id, data);
}

export async function deleteWalletAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  return deleteWallet(id);
}

