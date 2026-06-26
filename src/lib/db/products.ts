import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import type {
  ActionResult,
  ParentProductDTO,
  ProductListItemDTO,
  SaveParentProductInput,
  SaveVariantInput,
  VariantDTO,
} from "@/lib/dto";

function productDetailQuery(where?: Prisma.ProductWhereInput) {
  return prisma.product.findMany({
    where,
    take: where ? undefined : 100,
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
    supplierCost: variant.supplierCost,
    supplierCurrency: variant.supplierCurrency,
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
    supplierCost: null,
    supplierCurrency: "MAD",
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
  const products = await readProductRows();
  return products.map(toParent);
}

export async function getProductList(): Promise<ProductListItemDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      category: true,
      active: true,
      _count: { select: { variants: true } },
    },
  });
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    category: row.category,
    active: row.active,
    variantCount: row._count.variants,
  }));
}

export async function getParentProductBySlug(slug: string): Promise<ParentProductDTO | null> {
  await ensureDatabaseReady();
  const rows = await productDetailQuery({ slug });
  return rows[0] ? toParent(rows[0]) : null;
}

export async function duplicateVariant(variantId: string): Promise<ActionResult & { slug?: string }> {
  await ensureDatabaseReady();
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) return { ok: false, error: "Variant not found." };

  const newId = `${variantId}-copy-${Date.now().toString(36)}`;
  try {
    await prisma.productVariant.create({
      data: {
        id: newId,
        productId: variant.productId,
        name: `${variant.name} (copy)`,
        priceMad: variant.priceMad,
        faceValue: variant.faceValue,
        faceCurrency: variant.faceCurrency,
        stockControl: variant.stockControl,
        stockMode: variant.stockMode,
        active: variant.active,
        featured: false,
        supplierCost: variant.supplierCost,
        supplierCurrency: variant.supplierCurrency,
        sortOrder: variant.sortOrder + 1,
      },
    });
    return { ok: true, slug: newId };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function saveParentProduct(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }

  await ensureDatabaseReady();

  const productData = {
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
  };

  try {
    if (data.originalSlug) {
      // Editing existing product — use original slug as the lookup key so
      // renaming the slug doesn't create a duplicate.
      await prisma.product.update({
        where: { slug: data.originalSlug },
        data: { ...productData, slug: data.slug },
      });
    } else {
      // Creating a new product.
      await prisma.product.create({
        data: { ...productData, slug: data.slug, priceMad: 0 },
      });
    }
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
      supplierCost: data.supplierCost,
      supplierCurrency: data.supplierCurrency,
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
