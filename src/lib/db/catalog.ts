import "server-only";

import { prisma } from "@/lib/prisma";
import { variantTitle } from "@/lib/format";
import type { ActionResult } from "@/lib/dto";

// ── DTO types ─────────────────────────────────────────────────────────────────

export interface CatalogVariant {
  slug: string;
  parentSlug: string;
  name: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  featured: boolean;
  active: boolean;
  stockControl: string;
}

export interface CatalogParent {
  slug: string;
  name: string;
  category: string;
  brand: string | null;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription: string | null;
  longDescription: string | null;
  instructions: string | null;
  thumbnail: string | null;
  backgroundPreset: string;
  active: boolean;
  variants: CatalogVariant[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Read functions ────────────────────────────────────────────────────────────

/** Reads all parent products with their variants from the DB. */
export async function getCatalogFromDB(): Promise<CatalogParent[]> {
  const [parents, variants] = await Promise.all([
    prisma.parentProduct.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const variantsByParent: Record<string, CatalogVariant[]> = {};
  for (const v of variants) {
    const cv: CatalogVariant = {
      slug: v.slug,
      parentSlug: v.parentSlug,
      name: v.name,
      priceMad: v.priceMad,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      featured: v.featured,
      active: v.active,
      stockControl: v.stockControl,
    };
    if (!variantsByParent[v.parentSlug]) variantsByParent[v.parentSlug] = [];
    variantsByParent[v.parentSlug].push(cv);
  }

  return parents.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    brand: p.brand,
    region: p.region,
    deliveryType: p.deliveryType,
    description: p.description,
    shortDescription: p.shortDescription,
    longDescription: p.longDescription,
    instructions: p.instructions,
    thumbnail: p.thumbnail,
    backgroundPreset: p.backgroundPreset,
    active: p.active,
    variants: variantsByParent[p.slug] ?? [],
  }));
}

/** Reads one parent product with its variants from the DB. */
export async function getParentFromDB(slug: string): Promise<CatalogParent | null> {
  const [p, variants] = await Promise.all([
    prisma.parentProduct.findUnique({ where: { slug } }),
    prisma.product.findMany({ where: { parentSlug: slug }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!p) return null;

  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    brand: p.brand,
    region: p.region,
    deliveryType: p.deliveryType,
    description: p.description,
    shortDescription: p.shortDescription,
    longDescription: p.longDescription,
    instructions: p.instructions,
    thumbnail: p.thumbnail,
    backgroundPreset: p.backgroundPreset,
    active: p.active,
    variants: variants.map((v) => ({
      slug: v.slug,
      parentSlug: v.parentSlug,
      name: v.name,
      priceMad: v.priceMad,
      faceValue: v.faceValue,
      faceCurrency: v.faceCurrency,
      featured: v.featured,
      active: v.active,
      stockControl: v.stockControl,
    })),
  };
}

// ── Write functions ───────────────────────────────────────────────────────────

/**
 * Upsert a parent product.
 * If slug is empty, generates one from the name.
 * Returns the slug.
 */
export async function upsertParentProduct(data: {
  slug: string;
  name: string;
  category: string;
  brand?: string;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription?: string;
  longDescription?: string;
  instructions?: string;
  thumbnail?: string;
  backgroundPreset?: string;
  active: boolean;
}): Promise<string> {
  const slug = data.slug.trim() || slugify(data.name);

  await prisma.parentProduct.upsert({
    where: { slug },
    update: {
      name:             data.name,
      category:         data.category,
      brand:            data.brand || null,
      region:           data.region,
      deliveryType:     data.deliveryType,
      description:      data.description,
      shortDescription: data.shortDescription || null,
      longDescription:  data.longDescription || null,
      instructions:     data.instructions || null,
      thumbnail:        data.thumbnail || null,
      backgroundPreset: data.backgroundPreset ?? "",
      active:           data.active,
    },
    create: {
      slug,
      name:             data.name,
      category:         data.category,
      brand:            data.brand || null,
      region:           data.region,
      deliveryType:     data.deliveryType,
      description:      data.description,
      shortDescription: data.shortDescription || null,
      longDescription:  data.longDescription || null,
      instructions:     data.instructions || null,
      thumbnail:        data.thumbnail || null,
      backgroundPreset: data.backgroundPreset ?? "",
      active:           data.active,
    },
  });

  return slug;
}

/**
 * Upsert a variant.
 * If variantSlug is empty, generates one like "{parentSlug}-{faceValue}{faceCurrency.toLowerCase()}".
 * Returns the slug.
 */
export async function upsertVariant(data: {
  variantSlug: string;
  parentSlug: string;
  faceValue: number;
  faceCurrency: string;
  priceMad: number;
  featured: boolean;
  active: boolean;
}): Promise<string> {
  const parent = await prisma.parentProduct.findUnique({ where: { slug: data.parentSlug } });
  const parentName = parent?.name ?? data.parentSlug;

  const variantSlug =
    data.variantSlug.trim() ||
    `${data.parentSlug}-${data.faceValue}${data.faceCurrency.toLowerCase()}`;

  const name = variantTitle(parentName, data.faceValue, data.faceCurrency);
  const category = parent?.category ?? "";
  const region = parent?.region ?? "";
  const deliveryType = parent?.deliveryType ?? "Code numérique instantané";

  await prisma.product.upsert({
    where: { slug: variantSlug },
    update: {
      name,
      parentSlug:   data.parentSlug,
      category,
      priceMad:     data.priceMad,
      faceValue:    data.faceValue,
      faceCurrency: data.faceCurrency,
      region,
      deliveryType,
      featured:     data.featured,
      active:       data.active,
    },
    create: {
      slug:         variantSlug,
      name,
      parentSlug:   data.parentSlug,
      category,
      priceMad:     data.priceMad,
      faceValue:    data.faceValue,
      faceCurrency: data.faceCurrency,
      region,
      deliveryType,
      featured:     data.featured,
      active:       data.active,
    },
  });

  return variantSlug;
}

/**
 * Hard-delete a variant. Checks that no order items reference it first.
 */
export async function deleteVariant(slug: string): Promise<ActionResult> {
  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product) return { ok: false, error: "Variant not found." };

  const orderItemCount = await prisma.orderItem.count({ where: { productId: product.id } });
  if (orderItemCount > 0) {
    return {
      ok: false,
      error: `Cannot delete: ${orderItemCount} order item(s) reference this variant. Deactivate it instead.`,
    };
  }

  await prisma.digitalCode.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { slug } });
  return { ok: true };
}

/**
 * Soft-delete parent: set active=false on parent + all its variants.
 */
export async function deactivateParentProduct(slug: string): Promise<void> {
  await prisma.parentProduct.update({ where: { slug }, data: { active: false } });
  await prisma.product.updateMany({ where: { parentSlug: slug }, data: { active: false } });
}
