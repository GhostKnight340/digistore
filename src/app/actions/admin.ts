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
  setStockControl,
} from "@/lib/db/inventory";
import { confirmPayment, deliverOrder } from "@/lib/db/fulfillment";
import {
  getCatalogFromDB,
  upsertParentProduct,
  upsertVariant,
  deleteVariant,
  deactivateParentProduct,
} from "@/lib/db/catalog";
import type {
  ActionResult,
  AdminCodeDTO,
  AdminOrderDTO,
  InventoryGroupDTO,
  ItemAssignment,
} from "@/lib/dto";
import type { CatalogParent } from "@/lib/db/catalog";

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

export async function setStockControlAction(
  productSlug: string,
  mode: "auto" | "manual",
): Promise<ActionResult> {
  try {
    return await setStockControl(productSlug, mode);
  } catch (e) {
    console.error("[setStockControlAction]", e);
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

// ── Catalog management actions ────────────────────────────────────────────────

export async function getCatalogAction(): Promise<CatalogParent[]> {
  try {
    return await getCatalogFromDB();
  } catch (e) {
    console.error("[getCatalogAction]", e);
    return [];
  }
}

export async function saveParentProductAction(data: {
  slug: string;
  name: string;
  category: string;
  brand: string;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription: string;
  longDescription: string;
  instructions: string;
  thumbnail: string;
  backgroundPreset: string;
  active: boolean;
}): Promise<ActionResult & { slug?: string }> {
  try {
    const slug = await upsertParentProduct({
      slug:             data.slug,
      name:             data.name,
      category:         data.category,
      brand:            data.brand || undefined,
      region:           data.region,
      deliveryType:     data.deliveryType,
      description:      data.description,
      shortDescription: data.shortDescription || undefined,
      longDescription:  data.longDescription || undefined,
      instructions:     data.instructions || undefined,
      thumbnail:        data.thumbnail || undefined,
      backgroundPreset: data.backgroundPreset,
      active:           data.active,
    });
    return { ok: true, slug };
  } catch (e) {
    console.error("[saveParentProductAction]", e);
    return { ok: false, error: "Erreur lors de la sauvegarde du produit." };
  }
}

export async function saveVariantAction(data: {
  variantSlug: string;
  parentSlug: string;
  faceValue: number;
  faceCurrency: string;
  priceMad: number;
  featured: boolean;
  active: boolean;
}): Promise<ActionResult & { slug?: string }> {
  try {
    const slug = await upsertVariant(data);
    return { ok: true, slug };
  } catch (e) {
    console.error("[saveVariantAction]", e);
    return { ok: false, error: "Erreur lors de la sauvegarde de la variante." };
  }
}

export async function deleteCatalogVariantAction(slug: string): Promise<ActionResult> {
  try {
    return await deleteVariant(slug);
  } catch (e) {
    console.error("[deleteCatalogVariantAction]", e);
    return { ok: false, error: "Erreur lors de la suppression de la variante." };
  }
}

export async function deactivateParentAction(slug: string): Promise<ActionResult> {
  try {
    await deactivateParentProduct(slug);
    return { ok: true };
  } catch (e) {
    console.error("[deactivateParentAction]", e);
    return { ok: false, error: "Erreur lors de la désactivation du produit." };
  }
}
