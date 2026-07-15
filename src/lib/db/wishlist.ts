import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { getPublicParentCards } from "./catalog";
import type { Product } from "@/lib/types";

/**
 * Server-side customer wishlist ("Favoris"). Every function is keyed by a
 * server-derived customerId (never a client-supplied id), so one customer can
 * never read or mutate another's wishlist. All product lookups go through the
 * SAME visibility filter as the storefront, so a hidden/inactive/removed product
 * can neither be saved nor rendered. The unique (customerId, productId) index
 * prevents duplicate rows.
 */

/** Resolve a set of parent-product slugs to their VISIBLE db ids (order-agnostic). */
async function visibleProductIdsBySlug(
  slugs: string[],
): Promise<{ id: string; slug: string }[]> {
  const clean = [...new Set(slugs.map((s) => s.trim()).filter(Boolean))].slice(0, 100);
  if (clean.length === 0) return [];
  return prisma.product.findMany({
    where: {
      slug: { in: clean },
      active: true,
      categoryRecord: { is: { active: true } },
      variants: { some: { active: true } },
    },
    select: { id: true, slug: true },
  });
}

/** Slugs of the customer's saved products that are still visible. */
export async function getWishlistSlugs(customerId: string): Promise<string[]> {
  await ensureDatabaseReady();
  const rows = await prisma.wishlistItem.findMany({
    where: {
      customerId,
      product: {
        active: true,
        categoryRecord: { is: { active: true } },
        variants: { some: { active: true } },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { product: { select: { slug: true } } },
  });
  return rows.map((r) => r.product.slug);
}

/** Full visible wishlist cards + saved date, newest-first, for /account/favoris. */
export async function getWishlistCards(
  customerId: string,
): Promise<{ product: Product; savedAt: string }[]> {
  await ensureDatabaseReady();
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { productId: true, createdAt: true },
  });
  if (rows.length === 0) return [];
  const cards = await getPublicParentCards(rows.map((r) => r.productId));
  // Preserve newest-first order and drop any product no longer visible.
  const out: { product: Product; savedAt: string }[] = [];
  for (const row of rows) {
    const product = cards.get(row.productId);
    if (product) out.push({ product, savedAt: row.createdAt.toISOString() });
  }
  return out;
}

/**
 * Toggle a product (by slug) in the customer's wishlist. Returns the resulting
 * saved state. Saving a hidden/unknown product is a no-op that reports unsaved.
 */
export async function toggleWishlist(
  customerId: string,
  slug: string,
): Promise<{ ok: boolean; saved: boolean; error?: string }> {
  await ensureDatabaseReady();
  const [product] = await visibleProductIdsBySlug([slug]);
  if (!product) return { ok: false, saved: false, error: "Produit indisponible." };

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_productId: { customerId, productId: product.id } },
    select: { id: true },
  });
  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { ok: true, saved: false };
  }
  try {
    await prisma.wishlistItem.create({ data: { customerId, productId: product.id } });
  } catch {
    // Unique-constraint race: another request created it — treat as saved.
    return { ok: true, saved: true };
  }
  return { ok: true, saved: true };
}

/** Remove a product (by slug) from the wishlist. Idempotent. */
export async function removeWishlist(
  customerId: string,
  slug: string,
): Promise<{ ok: boolean }> {
  await ensureDatabaseReady();
  const [product] = await prisma.product.findMany({
    where: { slug: slug.trim() },
    select: { id: true },
    take: 1,
  });
  if (!product) return { ok: true };
  await prisma.wishlistItem
    .delete({ where: { customerId_productId: { customerId, productId: product.id } } })
    .catch(() => undefined);
  return { ok: true };
}

/**
 * Merge a guest's local wishlist (slugs) into the account on login. Additive and
 * idempotent: existing rows are kept (createMany skipDuplicates), only new
 * visible products are inserted. Returns the customer's full visible slug set.
 */
export async function mergeWishlist(
  customerId: string,
  slugs: string[],
): Promise<string[]> {
  await ensureDatabaseReady();
  const products = await visibleProductIdsBySlug(slugs);
  if (products.length > 0) {
    await prisma.wishlistItem.createMany({
      data: products.map((p) => ({ customerId, productId: p.id })),
      skipDuplicates: true,
    });
  }
  return getWishlistSlugs(customerId);
}
