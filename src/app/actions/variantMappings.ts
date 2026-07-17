"use server";

/**
 * Admin actions for variant ↔ supplier mappings (the "Approvisionnement"
 * section of the variant editor). Every action requires an admin session and
 * re-validates inputs server-side — supplier ids, costs, priorities and
 * enabled states from the browser are never trusted as-is.
 */
import { requireAdminCustomer } from "@/lib/auth";
import {
  deleteVariantMapping,
  getProductSupplySummaries,
  getVariantSupply,
  reorderVariantMappings,
  saveVariantMapping,
  setManualFulfillment,
  setVariantMappingEnabled,
  validateVariantMapping,
} from "@/lib/db/variantMappings";
import {
  getGiftCardCategories,
  getGiftCardOffers,
  getTopupCategories,
  getTopupOffers,
} from "@/lib/fazercards/operations";
import { describeFazerCardsError } from "@/lib/fazercards/client";
import type {
  ActionResult,
  FazerCardsCatalogOfferDTO,
  MappingValidationResultDTO,
  SaveVariantMappingInput,
  VariantSupplyDTO,
} from "@/lib/dto";

export async function getVariantSupplyAction(variantId: string): Promise<VariantSupplyDTO | null> {
  await requireAdminCustomer();
  return getVariantSupply(variantId);
}

export async function saveVariantMappingAction(
  input: SaveVariantMappingInput,
): Promise<ActionResult> {
  await requireAdminCustomer();
  return saveVariantMapping(input);
}

export async function deleteVariantMappingAction(id: string): Promise<ActionResult> {
  await requireAdminCustomer();
  return deleteVariantMapping(id);
}

export async function setVariantMappingEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  await requireAdminCustomer();
  return setVariantMappingEnabled(id, enabled);
}

/** orderedIds[0] devient le fournisseur préféré, orderedIds[1] le secours. */
export async function reorderVariantMappingsAction(
  variantId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  await requireAdminCustomer();
  return reorderVariantMappings(variantId, orderedIds);
}

export async function setManualFulfillmentAction(
  variantId: string,
  allowed: boolean,
): Promise<ActionResult> {
  await requireAdminCustomer();
  return setManualFulfillment(variantId, allowed);
}

/** Read-only "Vérifier le mapping" — never places an order. */
export async function validateVariantMappingAction(
  id: string,
): Promise<MappingValidationResultDTO> {
  await requireAdminCustomer();
  return validateVariantMapping(id);
}

/** Per-parent supply summary for the product list filter/badges. */
export async function getProductSupplySummariesAction(): Promise<Record<string, string>> {
  await requireAdminCustomer();
  return getProductSupplySummaries();
}

// ── FazerCards catalog assistance (read-only) ────────────────────────────────

export async function listFazerCardsCategoriesAction(input: {
  kind: "gift_card" | "topup";
  cursor?: string;
}): Promise<{ ok: boolean; items: { categoryId: string; name: string }[]; error?: string }> {
  await requireAdminCustomer();
  try {
    const page =
      input.kind === "topup"
        ? await getTopupCategories({ limit: 50, cursor: input.cursor })
        : await getGiftCardCategories({ limit: 50, cursor: input.cursor });
    return {
      ok: true,
      items: page.items.map((item) => ({ categoryId: item.category_id, name: item.name })),
    };
  } catch (error) {
    return { ok: false, items: [], error: describeFazerCardsError("catalog", error) };
  }
}

export async function listFazerCardsOffersAction(input: {
  kind: "gift_card" | "topup";
  categoryId: string;
}): Promise<{ ok: boolean; items: FazerCardsCatalogOfferDTO[]; error?: string }> {
  await requireAdminCustomer();
  try {
    if (input.kind === "topup") {
      const catalog = await getTopupOffers(input.categoryId);
      return {
        ok: true,
        items: catalog.offers.map((offer) => ({
          offerId: offer.offer_id,
          name: offer.name,
          priceUsd: offer.price_usd,
          stock: null,
        })),
      };
    }
    const catalog = await getGiftCardOffers(input.categoryId);
    return {
      ok: true,
      items: catalog.offers.map((offer) => ({
        offerId: offer.card_id,
        name: offer.name,
        priceUsd: offer.price_usd,
        stock: offer.stock,
      })),
    };
  } catch (error) {
    return { ok: false, items: [], error: describeFazerCardsError("catalog", error) };
  }
}
