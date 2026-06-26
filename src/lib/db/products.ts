import "server-only";

import { Prisma } from "@prisma/client";
import { DENOMINATION_SLUGS } from "@/lib/products";
import { ensureDatabaseReady, prisma } from "./prisma";
import type {
  ActionResult,
  ParentProductDTO,
  SaveParentProductInput,
  SaveVariantInput,
  VariantDTO,
} from "@/lib/dto";

function productDetailQuery(where?: Prisma.ProductWhereInput) {
  return prisma.product.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      variants: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      media: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: { digitalCodes: { where: { status: "unused" } } },
      },
    },
  });
}

function readProductRows() {
  return productDetailQuery(undefined);
}

type ProductRow = Awaited<ReturnType<typeof readProductRows>>[number];

function toVariant(product: ProductRow, variant: ProductRow["variants"][number]): VariantDTO {
  return {
    id: variant.id,
    slug: variant.id,
    name: variant.name,
    priceMad: variant.priceMad,
    faceValue: variant.faceValue,
    faceCurrency: variant.faceCurrency,
    active: variant.active,
    featured: variant.featured,
    stockControl: variant.stockControl,
    stockMode: variant.stockMode,
    inventoryUnused: product._count.digitalCodes,
  };
}

function productAsFallbackVariant(product: ProductRow): VariantDTO {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceMad: product.priceMad,
    faceValue: null,
    faceCurrency: "MAD",
    active: product.active,
    featured: product.featured,
    stockControl: "manual",
    stockMode: "automatic",
    inventoryUnused: product._count.digitalCodes,
  };
}

function toParent(product: ProductRow): ParentProductDTO {
  const variants =
    product.variants.length > 0
      ? product.variants.map((variant) => toVariant(product, variant))
      : [productAsFallbackVariant(product)];

  return {
    slug: product.slug,
    name: product.name,
    category: product.category,
    brand: product.brand,
    region: product.region,
    deliveryType: product.deliveryType,
    description: product.description,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    instructions: product.instructions,
    thumbnail: product.imageUrl ?? product.media[0]?.url ?? null,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    variants,
  };
}

export async function getParentProducts(): Promise<ParentProductDTO[]> {
  await ensureDatabaseReady();
  const rows = await readProductRows();
  // Exclude legacy denomination products (steam-50, psn-100, etc.) that are
  // preserved only for order history. Only parent platform products appear here.
  return rows
    .filter((row) => !DENOMINATION_SLUGS.has(row.slug))
    .map(toParent);
}

export async function saveParentProduct(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }

  await ensureDatabaseReady();

  try {
    await prisma.product.upsert({
      where: { slug: data.slug },
      update: {
        name: data.name,
        category: data.category,
        brand: data.brand,
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
        shortDescription: data.shortDescription,
        longDescription: data.longDescription,
        instructions: data.instructions,
        imageUrl: data.thumbnail || null,
        active: data.active,
      },
      create: {
        slug: data.slug,
        name: data.name,
        category: data.category,
        brand: data.brand,
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
        shortDescription: data.shortDescription,
        longDescription: data.longDescription,
        instructions: data.instructions,
        imageUrl: data.thumbnail || null,
        active: data.active,
        priceMad: 0,
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function saveVariant(data: SaveVariantInput): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }

  await ensureDatabaseReady();

  try {
    const product = await prisma.product.findUnique({
      where: { slug: data.parentSlug },
      include: { variants: true },
    });

    if (!product) return { ok: false, error: "Product not found." };

    if (data.slug === product.slug || data.slug === product.id) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          name: data.name,
          priceMad: data.priceMad,
          active: data.active,
          featured: data.featured,
          category: data.category,
          region: data.region,
          deliveryType: data.deliveryType,
        },
      });
      return { ok: true };
    }

    const existing =
      product.variants.find((variant) => variant.id === data.slug) ??
      product.variants.find((variant) => variant.name === data.name);

    const variantFields = {
      name: data.name,
      priceMad: data.priceMad,
      faceValue: data.faceValue,
      faceCurrency: data.faceCurrency,
      stockControl: data.stockControl,
      stockMode: data.stockMode,
      active: data.active,
      featured: data.featured,
    };

    if (existing) {
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: variantFields,
      });
    } else {
      await prisma.productVariant.create({
        data: {
          id: data.slug,
          productId: product.id,
          ...variantFields,
          sortOrder: product.variants.length,
        },
      });
    }

    await prisma.product.update({
      where: { id: product.id },
      data: { featured: data.featured },
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function deleteVariant(slug: string): Promise<ActionResult> {
  await ensureDatabaseReady();

  const product = await prisma.product.findUnique({ where: { slug } });
  if (product) {
    return {
      ok: false,
      error: "Cannot delete the base product row. Hide it instead.",
    };
  }

  const variant = await prisma.productVariant.findUnique({ where: { id: slug } });
  if (!variant) return { ok: false, error: "Variant not found." };

  await prisma.productVariant.delete({ where: { id: slug } });
  return { ok: true };
}
