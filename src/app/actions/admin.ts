"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/cacheTags";
import { requireAdminCustomer } from "@/lib/auth";
import {
  getAdminCustomers,
  deleteCustomerAccount,
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
  createPaymentMethod,
  updatePaymentMethod,
  reorderPaymentMethods,
  archivePaymentMethod,
  restorePaymentMethod,
  deletePaymentMethod,
  updateSupportConfig,
} from "@/lib/db/paymentMethods";
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
  reorderVariants,
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
import { adminCommandSearch, type CommandSearchResult } from "@/lib/db/adminSearch";
import { getStoreSettings } from "@/lib/db/catalog";
import {
  renderEmailTemplate,
  sampleVariablesForKey,
  type EmailTemplateKey,
  type RenderedEmailTemplate,
} from "@/lib/emailTemplates";
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
  SaveMethodInput,
} from "@/lib/dto";
import type { OrderStatus } from "@/lib/types";

async function assertAdminAccess() {
  await requireAdminCustomer();
}

function revalidateStorefrontCatalog() {
  // Invalidate the cross-request data cache (see src/lib/cacheTags.ts) so the
  // storefront reflects catalog/pricing edits on the next load.
  revalidateTag(CATALOG_TAG);
  revalidatePath("/", "layout");
  revalidatePath("/", "page");
  revalidatePath("/products", "page");
  revalidatePath("/products/[id]", "page");
}

export async function adminCommandSearchAction(query: string): Promise<CommandSearchResult> {
  await assertAdminAccess();
  return adminCommandSearch(query);
}

export async function getAdminOrdersAction(): Promise<AdminOrderSummaryDTO[]> {
  await assertAdminAccess();
  return getAdminOrdersPage({ take: 10 });
}

export async function previewEmailTemplateAction(
  templateKey: EmailTemplateKey,
  subject: string,
  body: string,
): Promise<RenderedEmailTemplate> {
  await assertAdminAccess();
  const settings = await getStoreSettings();
  const variables = sampleVariablesForKey(templateKey);
  return renderEmailTemplate(settings, templateKey, variables, { subject, body });
}

export async function sendTestEmailAction(
  to: string,
  templateKey: EmailTemplateKey,
  subject: string,
  body: string,
): Promise<ActionResult> {
  await assertAdminAccess();
  const recipient = to.trim();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, error: "Adresse email invalide." };
  }
  const settings = await getStoreSettings();
  const variables = sampleVariablesForKey(templateKey);
  const rendered = renderEmailTemplate(settings, templateKey, variables, { subject, body });
  const result = await sendTransactionalEmail({
    to: recipient,
    templateKey,
    type: "test_email",
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    variables,
    metadata: { source: "admin_test_email" },
    manuallyEdited: true,
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

export async function deleteCustomerAccountAction(
  customerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdminCustomer();
  const result = await deleteCustomerAccount(customerId, admin.id);
  if (result.ok) revalidatePath("/admin");
  return result;
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

export async function deleteCategoryAction(
  id: string,
  reassignToId?: string | null,
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await deleteCategory(id, reassignToId);
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

export async function reorderVariantsAction(
  parentSlug: string,
  orderedSlugs: string[],
): Promise<ActionResult> {
  await assertAdminAccess();
  const result = await reorderVariants(parentSlug, orderedSlugs);
  if (result.ok) revalidateStorefrontCatalog();
  return result;
}

// â”€â”€â”€ Payment settings admin actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createPaymentMethodAction(
  data: SaveMethodInput,
): Promise<ActionResult & { id?: string }> {
  await assertAdminAccess();
  return createPaymentMethod(data);
}

export async function updatePaymentMethodAction(
  id: string,
  data: Partial<SaveMethodInput>,
): Promise<ActionResult> {
  await assertAdminAccess();
  return updatePaymentMethod(id, data);
}

export async function reorderPaymentMethodsAction(ids: string[]): Promise<ActionResult> {
  await assertAdminAccess();
  return reorderPaymentMethods(ids);
}

export async function archivePaymentMethodAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  return archivePaymentMethod(id);
}

export async function restorePaymentMethodAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  return restorePaymentMethod(id);
}

export async function deletePaymentMethodAction(id: string): Promise<ActionResult> {
  await assertAdminAccess();
  return deletePaymentMethod(id);
}

export async function updateSupportConfigAction(data: {
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}): Promise<ActionResult> {
  await assertAdminAccess();
  return updateSupportConfig(data);
}

