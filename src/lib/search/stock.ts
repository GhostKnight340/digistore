/**
 * The single storefront availability rule for a product variant. Pure and
 * client-safe (no DB, no `server-only`) so the catalogue DTOs, the product page,
 * the JSON-LD offers, and unit tests all share one implementation.
 *
 * This MUST stay identical to the checkout-side check in
 * `lib/db/promoResolve.ts` (`isVariantPurchasable`): a variant shown as
 * available but refused at checkout is a broken purchase, and the reverse hides
 * sellable stock.
 */
import { isInventoryEnabled } from "@/lib/storeSettings";

/** Inventory-relevant subset of the store settings. */
export interface StockSettings {
  inventoryEnabled?: boolean;
  inventoryMode?: string;
}

/** Unknown stock modes behave as "automatic" (quantity-driven). */
export type NormalizedStockMode = "automatic" | "force_in_stock" | "force_out_of_stock";

export function normalizeStockMode(value: string): NormalizedStockMode {
  return value === "force_in_stock" || value === "force_out_of_stock" ? value : "automatic";
}

/**
 * Availability for one variant. `settings` omitted means "no inventory context"
 * — treated as available (some catalogue DTOs read that way). `unusedCodes` is
 * the count of undelivered digital codes for the variant.
 */
export function isVariantAvailable(
  stockMode: string,
  unusedCodes: number,
  settings?: StockSettings,
): boolean {
  const mode = normalizeStockMode(stockMode);
  if (mode === "force_in_stock") return true;
  // Inventory OFF: availability is active-only — the force_out_of_stock
  // override is an inventory lever and is ignored.
  if (settings && !isInventoryEnabled({ inventoryEnabled: settings.inventoryEnabled ?? true }))
    return true;
  if (mode === "force_out_of_stock") return false;
  // Manual mode: codes are fulfilled by hand, so the code count says nothing.
  if (!settings || settings.inventoryMode === "manual") return true;
  return unusedCodes > 0;
}
