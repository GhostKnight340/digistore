import "server-only";

import { isInventoryEnabled } from "@/lib/storeSettings";

import { getStoreSettings } from "./catalog";
import { prisma } from "./prisma";

/**
 * A checkout item id is either a Product.slug (parent-level purchasable) or a
 * ProductVariant.id (a denomination). This mirrors the resolution createOrder
 * already does, but additionally carries the parent product id and category id
 * so the promo engine can evaluate product/category eligibility. Prices are
 * always re-read from the DB — never trusted from the client.
 */
export interface ResolvedCartLine {
  /** The original client id (Product.slug or ProductVariant.id). */
  lineKey: string;
  /** Parent Product.id — the key promo product-restrictions match against. */
  productId: string;
  variantId: string | null;
  /** Category id (Product.category FK) — the key category-restrictions match. */
  categoryId: string | null;
  unitPriceMad: number;
  quantity: number;
  name: string;
}

/**
 * Resolve raw checkout items into priced, category-tagged lines. Only active,
 * *purchasable* products/variants in active categories are returned (unknown,
 * inactive and out-of-stock ids are dropped). Quantities < 1 are dropped.
 *
 * Availability is re-checked here rather than trusted from the storefront: the
 * cart lives in client-side localStorage, so both the ids and the quantities are
 * attacker-controlled, and a variant can sell out between add-to-cart and
 * checkout. createOrder refuses the whole order when a line fails to resolve,
 * which turns a dropped line into the correct "plus disponible" error.
 */
export async function resolveCartLines(
  items: { productId: string; quantity: number }[],
): Promise<ResolvedCartLine[]> {
  const ids = items.map((i) => i.productId);
  const settings = await getStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);
  const countUnusedCodes = inventoryOn && settings.inventoryMode !== "manual";

  /**
   * Mirrors variantStockStatus() in catalog.ts, which drives the storefront
   * badge — the two must agree or a variant shown as available would be
   * refused at checkout (and vice versa).
   */
  const isVariantPurchasable = (stockMode: string, unusedCodes: number) => {
    if (stockMode === "force_in_stock") return true;
    if (!inventoryOn) return true;
    if (stockMode === "force_out_of_stock") return false;
    if (!countUnusedCodes) return true;
    return unusedCodes > 0;
  };

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: {
        slug: { in: ids },
        active: true,
        categoryRecord: { is: { active: true } },
        // A product that has purchasable denominations is only sellable *via*
        // one of them — its own priceMad is a "from" price. Without this, a
        // hand-edited cart could buy a 1000 DH variant at the parent price.
        variants: { none: { active: true } },
      },
      select: { id: true, slug: true, name: true, priceMad: true, category: true },
    }),
    prisma.productVariant.findMany({
      where: {
        id: { in: ids },
        active: true,
        product: { active: true, categoryRecord: { is: { active: true } } },
      },
      select: {
        id: true,
        priceMad: true,
        name: true,
        productId: true,
        stockMode: true,
        product: { select: { name: true, category: true } },
        _count: { select: { digitalCodes: { where: { status: "unused" } } } },
      },
    }),
  ]);

  const byKey = new Map<string, Omit<ResolvedCartLine, "lineKey" | "quantity">>();
  for (const product of products) {
    byKey.set(product.slug, {
      productId: product.id,
      variantId: null,
      categoryId: product.category,
      unitPriceMad: product.priceMad,
      name: product.name,
    });
  }
  for (const variant of variants) {
    if (!isVariantPurchasable(variant.stockMode, variant._count.digitalCodes)) continue;
    byKey.set(variant.id, {
      productId: variant.productId,
      variantId: variant.id,
      categoryId: variant.product.category,
      unitPriceMad: variant.priceMad,
      name: `${variant.product.name} - ${variant.name}`,
    });
  }

  const lines: ResolvedCartLine[] = [];
  for (const item of items) {
    const resolved = byKey.get(item.productId);
    if (!resolved || item.quantity < 1) continue;
    lines.push({ lineKey: item.productId, quantity: item.quantity, ...resolved });
  }
  return lines;
}
