import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  ActionResult,
  ParentProductDTO,
  SaveParentProductInput,
  SaveVariantInput,
  VariantDTO,
} from "@/lib/dto";

export async function getParentProducts(): Promise<ParentProductDTO[]> {
  const [parents, variants, codeCounts] = await Promise.all([
    prisma.parentProduct.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { priceMad: "asc" } }),
    prisma.digitalCode.groupBy({
      by: ["productId", "status"],
      _count: { id: true },
    }),
  ]);

  const unusedMap = new Map<string, number>();
  for (const row of codeCounts) {
    if (row.status === "unused") {
      unusedMap.set(
        row.productId,
        (unusedMap.get(row.productId) ?? 0) + row._count.id,
      );
    }
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
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    variants: variants
      .filter((v) => v.parentSlug === p.slug)
      .map(
        (v): VariantDTO => ({
          id: v.id,
          slug: v.slug,
          name: v.name,
          priceMad: v.priceMad,
          faceValue: v.faceValue,
          faceCurrency: v.faceCurrency,
          active: v.active,
          featured: v.featured,
          stockControl: v.stockControl,
          inventoryUnused: unusedMap.get(v.id) ?? 0,
        }),
      ),
  }));
}

export async function saveParentProduct(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }
  try {
    await prisma.parentProduct.upsert({
      where: { slug: data.slug },
      update: {
        name: data.name,
        category: data.category,
        brand: data.brand || null,
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
        shortDescription: data.shortDescription || null,
        longDescription: data.longDescription || null,
        instructions: data.instructions || null,
        thumbnail: data.thumbnail || null,
        active: data.active,
      },
      create: {
        slug: data.slug,
        name: data.name,
        category: data.category,
        brand: data.brand || null,
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
        shortDescription: data.shortDescription || null,
        longDescription: data.longDescription || null,
        instructions: data.instructions || null,
        thumbnail: data.thumbnail || null,
        active: data.active,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteVariant(slug: string): Promise<ActionResult> {
  const variant = await prisma.product.findUnique({ where: { slug } });
  if (!variant) return { ok: false, error: "Variant not found." };

  const [orderCount, codeCount] = await Promise.all([
    prisma.orderItem.count({ where: { productId: variant.id } }),
    prisma.digitalCode.count({ where: { productId: variant.id } }),
  ]);

  if (orderCount > 0 || codeCount > 0) {
    return {
      ok: false,
      error: `Cannot delete: this variant has ${orderCount} order(s) and ${codeCount} inventory code(s). Deactivate it instead.`,
    };
  }

  await prisma.product.delete({ where: { slug } });
  return { ok: true };
}

export async function saveVariant(data: SaveVariantInput): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }
  try {
    await prisma.product.upsert({
      where: { slug: data.slug },
      update: {
        name: data.name,
        category: data.category,
        priceMad: data.priceMad,
        faceValue: data.faceValue,
        faceCurrency: data.faceCurrency,
        region: data.region,
        deliveryType: data.deliveryType,
        active: data.active,
        featured: data.featured,
        stockControl: data.stockControl,
      },
      create: {
        slug: data.slug,
        name: data.name,
        parentSlug: data.parentSlug,
        category: data.category,
        priceMad: data.priceMad,
        faceValue: data.faceValue,
        faceCurrency: data.faceCurrency,
        region: data.region,
        deliveryType: data.deliveryType,
        active: data.active,
        featured: data.featured,
        stockControl: data.stockControl,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
