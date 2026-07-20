import "server-only";

import { hasSufficientStock } from "@/lib/search/stock";

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
  /**
   * Inventory-relevant slice of the store settings, passed to the SHARED
   * predicate in lib/search/stock.ts — the same one driving the storefront
   * badge. Reusing it (rather than re-deriving the rules here, as this module
   * used to) is what guarantees a variant shown as available is not refused at
   * checkout, and vice versa.
   */
  const stockSettings = {
    inventoryEnabled: settings.inventoryEnabled,
    inventoryMode: settings.inventoryMode,
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

  /**
   * Resolved catalogue data plus the stock inputs needed to answer availability
   * once the requested QUANTITY is known. Parent-level (variant-less) products
   * carry no stock inputs: the storefront computes no stock status for them
   * either (see catalog.ts — parent cards derive theirs from variants), so
   * gating them here would refuse a purchase the storefront advertised. Their
   * fulfilment is effectively manual. Tracked in docs/launch-readiness-audit.md.
   */
  type Resolved = Omit<ResolvedCartLine, "lineKey" | "quantity"> & {
    stock: { stockMode: string; unusedCodes: number } | null;
  };

  const byKey = new Map<string, Resolved>();
  for (const product of products) {
    byKey.set(product.slug, {
      productId: product.id,
      variantId: null,
      categoryId: product.category,
      unitPriceMad: product.priceMad,
      name: product.name,
      stock: null,
    });
  }
  for (const variant of variants) {
    byKey.set(variant.id, {
      productId: variant.productId,
      variantId: variant.id,
      categoryId: variant.product.category,
      unitPriceMad: variant.priceMad,
      name: `${variant.product.name} - ${variant.name}`,
      stock: { stockMode: variant.stockMode, unusedCodes: variant._count.digitalCodes },
    });
  }

  /**
   * Total units requested per catalogue key. A cart normally merges duplicate
   * lines client-side, but the cart is attacker-controlled localStorage: two
   * lines of 1 must not each pass a "1 in stock" check independently.
   */
  const requestedByKey = new Map<string, number>();
  for (const item of items) {
    if (item.quantity < 1) continue;
    requestedByKey.set(item.productId, (requestedByKey.get(item.productId) ?? 0) + item.quantity);
  }

  const lines: ResolvedCartLine[] = [];
  for (const item of items) {
    const resolved = byKey.get(item.productId);
    if (!resolved || item.quantity < 1) continue;
    // Availability is checked against the TOTAL requested for this key, not this
    // one line. Dropping the line makes createOrder refuse the whole order with
    // the correct "plus disponible" message rather than silently short-shipping.
    if (
      resolved.stock &&
      !hasSufficientStock(
        resolved.stock.stockMode,
        resolved.stock.unusedCodes,
        requestedByKey.get(item.productId) ?? item.quantity,
        stockSettings,
      )
    ) {
      continue;
    }
    const { stock: _stock, ...line } = resolved;
    lines.push({ lineKey: item.productId, quantity: item.quantity, ...line });
  }
  return lines;
}
