import "server-only";

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
 * Resolve raw checkout items into priced, category-tagged lines. Only active
 * products/variants in active categories are returned (unknown/inactive ids are
 * dropped, exactly like createOrder). Quantities < 1 are dropped.
 */
export async function resolveCartLines(
  items: { productId: string; quantity: number }[],
): Promise<ResolvedCartLine[]> {
  const ids = items.map((i) => i.productId);
  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { slug: { in: ids }, active: true, categoryRecord: { is: { active: true } } },
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
        product: { select: { name: true, category: true } },
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
