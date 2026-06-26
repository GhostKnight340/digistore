import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import type {
  ActionResult,
  ParentProductDTO,
  SaveParentProductInput,
  SaveVariantInput,
  VariantDTO,
} from "@/lib/dto";

type ProductRow = Awaited<ReturnType<typeof readProductRows>>[number];

function readProductRows() {
  return prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      variants: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      media: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      digitalCodes: {
        select: { status: true },
      },
    },
  });
}

function toVariant(product: ProductRow, variant: ProductRow["variants"][number]): VariantDTO {
  return {
    id: variant.id,
    slug: variant.id,
    name: variant.name,
    priceMad: variant.priceMad,
    faceValue: null,
    faceCurrency: "MAD",
    active: variant.active,
    featured: product.featured,
    stockControl: "manual",
    stockMode: "automatic",
    inventoryUnused: product.digitalCodes.filter((code) => code.status === "unused").length,
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
    inventoryUnused: product.digitalCodes.filter((code) => code.status === "unused").length,
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
    brand: null,
    region: product.region,
    deliveryType: product.deliveryType,
    description: product.description,
    shortDescription: null,
    longDescription: null,
    instructions: null,
    thumbnail: product.imageUrl ?? product.media[0]?.url ?? null,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    variants,
  };
}

export async function getParentProducts(): Promise<ParentProductDTO[]> {
  await ensureDatabaseReady();
  const products = await readProductRows();
  return products.map(toParent);
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
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
        imageUrl: data.thumbnail || null,
        active: data.active,
      },
      create: {
        slug: data.slug,
        name: data.name,
        category: data.category,
        region: data.region,
        deliveryType: data.deliveryType,
        description: data.description,
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

    if (existing) {
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          priceMad: data.priceMad,
          active: data.active,
        },
      });
    } else {
      await prisma.productVariant.create({
        data: {
          id: data.slug,
          productId: product.id,
          name: data.name,
          priceMad: data.priceMad,
          active: data.active,
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
