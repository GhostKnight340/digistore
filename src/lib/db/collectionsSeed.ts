import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import {
  slugifyCollection,
  clampHomepageLimit,
  normalizeCollectionAliases,
} from "@/lib/collections/normalize";
import { defaultStoreSettings, mergeStoreSettings } from "@/lib/storeSettings";
import type { ClassifiableProduct } from "@/lib/collections/classify";

/**
 * DB glue for the collection seed script. Deliberately free of `next/cache` (and
 * of catalog.ts) so it can be imported by a standalone tsx script. Reads are
 * plain Prisma; the single write path (`seedCollectionBySlug`) is idempotent and
 * only ever upserts — it never deletes another collection.
 */

/** A real, eligible parent product plus the fields the classifier + ordering
 *  need. `eligible` mirrors the storefront rule: active product + active
 *  category + at least one active variant. */
export interface SeedCatalogProduct extends ClassifiableProduct {
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  active: boolean;
  categoryActive: boolean;
  eligible: boolean;
}

export async function getSeedCatalog(): Promise<SeedCatalogProduct[]> {
  await ensureDatabaseReady();
  const rows = await prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      categoryRecord: { select: { name: true, active: true } },
      variants: { where: { active: true }, select: { region: true } },
    },
  });
  return rows.map((row) => {
    const regions = new Set<string>();
    if (row.region) regions.add(row.region);
    for (const variant of row.variants) {
      const region = variant.region ?? row.region;
      if (region) regions.add(region);
    }
    const categoryActive = row.categoryRecord?.active ?? false;
    const eligible = row.active && categoryActive && row.variants.length > 0;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand ?? null,
      category: row.category,
      categoryName: row.categoryRecord?.name ?? row.category,
      regions: [...regions].filter(Boolean),
      featured: row.featured,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      active: row.active,
      categoryActive,
      eligible,
    };
  });
}

/**
 * The existing "Produits populaires" selection (StoreSettings.featuredProductIds
 * holds VARIANT ids) collapsed to ordered, de-duplicated PARENT product ids.
 * Reuses the real popularity selection — never fabricates one.
 */
export async function getPopularParentIds(): Promise<string[]> {
  await ensureDatabaseReady();
  const record = await prisma.storeSetting.findUnique({ where: { id: "default" } });
  const settings = record ? mergeStoreSettings(record.value) : defaultStoreSettings;
  const featuredVariantIds = settings.featuredProductIds;
  if (featuredVariantIds.length === 0) return [];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: featuredVariantIds } },
    select: { id: true, productId: true },
  });
  const byVariant = new Map(variants.map((v) => [v.id, v.productId]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const variantId of featuredVariantIds) {
    const productId = byVariant.get(variantId);
    if (productId && !seen.has(productId)) {
      seen.add(productId);
      out.push(productId);
    }
  }
  return out;
}

export interface SeedCollectionInput {
  slug: string;
  name: string;
  shortDescription?: string;
  longDescription?: string;
  active: boolean;
  sortOrder: number;
  showOnHomepage: boolean;
  homepageTitle?: string;
  homepageLimit?: number;
  ctaLabel?: string;
  seoTitle?: string;
  seoDescription?: string;
  aliases?: string[];
  /** Ordered parent-product ids. */
  productIds: string[];
}

export type SeedStatus = "created" | "updated" | "unchanged";

/**
 * Idempotent upsert of one collection identified by slug, plus its ordered
 * membership. Running it twice with the same inputs is a no-op ("unchanged").
 * Never deletes a different collection; only touches the fields it manages, so
 * an admin-set banner / schedule on an existing collection is preserved.
 */
export async function seedCollectionBySlug(
  input: SeedCollectionInput,
): Promise<{ status: SeedStatus; id: string }> {
  await ensureDatabaseReady();
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  const data = {
    slug: slugifyCollection(input.slug || input.name),
    name: input.name.trim(),
    shortDescription: (input.shortDescription ?? "").trim(),
    longDescription: (input.longDescription ?? "").trim(),
    active: input.active,
    sortOrder: input.sortOrder,
    showOnHomepage: input.showOnHomepage,
    homepageTitle: (input.homepageTitle ?? "").trim(),
    homepageLimit: clampHomepageLimit(input.homepageLimit ?? 8),
    ctaLabel: (input.ctaLabel ?? "").trim(),
    seoTitle: (input.seoTitle ?? "").trim(),
    seoDescription: (input.seoDescription ?? "").trim(),
    aliases: normalizeCollectionAliases(input.aliases ?? []),
  };

  const existing = await prisma.collection.findUnique({
    where: { slug: data.slug },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!existing) {
    const created = await prisma.collection.create({
      data: {
        ...data,
        items: {
          create: productIds.map((productId, index) => ({ productId, sortOrder: index })),
        },
      },
    });
    return { status: "created", id: created.id };
  }

  const existingIds = existing.items.map((item) => item.productId);
  const sameItems =
    existingIds.length === productIds.length &&
    existingIds.every((id, index) => id === productIds[index]);
  const sameScalars =
    existing.name === data.name &&
    existing.shortDescription === data.shortDescription &&
    existing.longDescription === data.longDescription &&
    existing.active === data.active &&
    existing.sortOrder === data.sortOrder &&
    existing.showOnHomepage === data.showOnHomepage &&
    existing.homepageTitle === data.homepageTitle &&
    existing.homepageLimit === data.homepageLimit &&
    existing.ctaLabel === data.ctaLabel &&
    existing.seoTitle === data.seoTitle &&
    existing.seoDescription === data.seoDescription &&
    JSON.stringify(existing.aliases) === JSON.stringify(data.aliases);

  if (sameScalars && sameItems) return { status: "unchanged", id: existing.id };

  await prisma.$transaction(async (tx) => {
    await tx.collection.update({ where: { id: existing.id }, data });
    if (!sameItems) {
      await tx.collectionProduct.deleteMany({ where: { collectionId: existing.id } });
      if (productIds.length > 0) {
        await tx.collectionProduct.createMany({
          data: productIds.map((productId, index) => ({
            collectionId: existing.id,
            productId,
            sortOrder: index,
          })),
          skipDuplicates: true,
        });
      }
    }
  });
  return { status: "updated", id: existing.id };
}
