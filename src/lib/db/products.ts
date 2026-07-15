import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { ensureCategoryForProduct } from "./categories";
import { timeAdmin } from "./adminTiming";
import { isRegionCode } from "@/lib/regions";
import { variantTitle } from "@/lib/pricing/variant-identity";
import type {
  ActionResult,
  ConvertProductToVariantInput,
  DeleteParentProductInput,
  FeaturedVariantOptionDTO,
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
        include: {
          _count: {
            select: { digitalCodes: { where: { status: "unused" } } },
          },
        },
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
    variantRegion: variant.region,
    active: variant.active,
    featured: variant.featured,
    stockControl: variant.stockControl,
    stockMode: variant.stockMode,
    inventoryUnused: variant._count.digitalCodes,
    reloadlyProductId: variant.reloadlyProductId,
    reloadlyCountryCode: variant.reloadlyCountryCode,
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
    variantRegion: null,
    active: product.active,
    featured: product.featured,
    stockControl: "manual",
    stockMode: "automatic",
    inventoryUnused: product._count.digitalCodes,
    reloadlyProductId: null,
    reloadlyCountryCode: null,
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
    featured: product.featured,
    searchAliases: product.searchAliases ?? [],
    createdAt: product.createdAt.toISOString(),
    variants,
  };
}

export async function getParentProducts(): Promise<ParentProductDTO[]> {
  await ensureDatabaseReady();
  const products = await timeAdmin(
    "admin.products.fullList",
    "product.findMany.detail",
    readProductRows,
    (rows) => rows.length,
  );
  return products.map(toParent);
}

export async function getProductList(): Promise<ProductListItemDTO[]> {
  await ensureDatabaseReady();
  const rows = await timeAdmin(
    "admin.products.list",
    "product.findMany.summary",
    () =>
      prisma.product.findMany({
        take: 200,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          slug: true,
          name: true,
          category: true,
          region: true,
          active: true,
          _count: { select: { variants: true } },
        },
      }),
    (result) => result.length,
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    category: row.category,
    region: row.region,
    active: row.active,
    variantCount: row._count.variants,
  }));
}

export async function getParentProductBySlug(slug: string): Promise<ParentProductDTO | null> {
  await ensureDatabaseReady();
  const rows = await timeAdmin(
    "admin.products.detail",
    "product.findMany.detailBySlug",
    () => productDetailQuery({ slug }),
    (result) => result.length,
  );
  return rows[0] ? toParent(rows[0]) : null;
}

export async function getFeaturedVariantOptions(): Promise<FeaturedVariantOptionDTO[]> {
  await ensureDatabaseReady();
  const rows = await prisma.productVariant.findMany({
    orderBy: [
      { featured: "desc" },
      { product: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
    include: {
      product: {
        select: {
          name: true,
          category: true,
          active: true,
          categoryRecord: {
            select: { name: true },
          },
        },
      },
    },
  });

  return rows.map((variant) => {
    const displayName = variantTitle(variant.product.name, variant);
    return {
      id: variant.id,
      productName: variant.product.name,
      variantName: variant.name,
      displayName,
      priceMad: variant.priceMad,
      category: variant.product.category,
      categoryName: variant.product.categoryRecord?.name ?? variant.product.category,
      productActive: variant.product.active,
      variantActive: variant.active,
      featured: variant.featured,
    };
  });
}

export async function duplicateVariant(variantId: string): Promise<ActionResult & { slug?: string }> {
  await ensureDatabaseReady();
  const variant = await timeAdmin(
    "admin.products.duplicateVariant",
    "productVariant.findUnique",
    () => prisma.productVariant.findUnique({ where: { id: variantId } }),
    (row) => (row ? 1 : 0),
  );
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

function copySlug(base: string): string {
  return `${base}-copy-${Date.now().toString(36)}`;
}

export async function duplicateParentProduct(slug: string): Promise<ActionResult & { slug?: string }> {
  await ensureDatabaseReady();
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      variants: true,
      media: true,
    },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const newSlug = copySlug(product.slug);
  try {
    await prisma.product.create({
      data: {
        name: `${product.name} (copy)`,
        slug: newSlug,
        category: product.category,
        description: product.description,
        shortDescription: product.shortDescription,
        longDescription: product.longDescription,
        instructions: product.instructions,
        brand: product.brand,
        priceMad: product.priceMad,
        region: product.region,
        deliveryType: product.deliveryType,
        imageUrl: product.imageUrl,
        featured: false,
        active: false,
        sortOrder: product.sortOrder + 1,
        media: {
          create: product.media.map((item) => ({
            url: item.url,
            alt: item.alt,
            sortOrder: item.sortOrder,
          })),
        },
        variants: {
          create: product.variants.map((variant) => ({
            id: `${newSlug}-${variant.id}`.slice(0, 180),
            name: variant.name,
            priceMad: variant.priceMad,
            faceValue: variant.faceValue,
            faceCurrency: variant.faceCurrency,
            stockControl: variant.stockControl,
            stockMode: variant.stockMode,
            supplierCost: variant.supplierCost,
            supplierCurrency: variant.supplierCurrency,
            active: variant.active,
            featured: false,
            sortOrder: variant.sortOrder,
          })),
        },
      },
    });
    return { ok: true, slug: newSlug };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function archiveParentProduct(slug: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  try {
    await prisma.product.update({
      where: { slug },
      data: { active: false, featured: false },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export async function deleteParentProduct(
  input: DeleteParentProductInput,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const product = await prisma.product.findUnique({
    where: { slug: input.slug },
    include: {
      variants: {
        select: { id: true },
      },
      _count: {
        select: {
          digitalCodes: true,
          orderItems: true,
          deliveredCodes: true,
          variants: true,
        },
      },
    },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const hasProtectedReferences =
    product._count.digitalCodes > 0 ||
    product._count.orderItems > 0 ||
    product._count.deliveredCodes > 0;

  if (input.variantStrategy === "delete" && hasProtectedReferences) {
    return {
      ok: false,
      error:
        "This product has inventory or order history. Archive it, or convert it into another parent product instead.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (input.variantStrategy === "move") {
        if (!input.targetParentSlug || input.targetParentSlug === input.slug) {
          throw new Error("Choose another parent product for the merge.");
        }
        const target = await tx.product.findUnique({
          where: { slug: input.targetParentSlug },
          select: {
            id: true,
            _count: { select: { variants: true } },
          },
        });
        if (!target) throw new Error("Target parent product not found.");

        await tx.productVariant.upsert({
          where: { id: product.slug },
          update: {
            productId: target.id,
            name: product.name,
            priceMad: product.priceMad,
            active: product.active,
            featured: product.featured,
            stockMode: "automatic",
          },
          create: {
            id: product.slug,
            productId: target.id,
            name: product.name,
            priceMad: product.priceMad,
            faceValue: null,
            faceCurrency: "MAD",
            stockControl: "manual",
            stockMode: "automatic",
            active: product.active,
            featured: product.featured,
            sortOrder: target._count.variants,
          },
        });

        await tx.productVariant.updateMany({
          where: { productId: product.id, id: { not: product.slug } },
          data: { productId: target.id },
        });
      await tx.digitalCode.updateMany({
        where: { productId: product.id },
        data: { productId: target.id, variantId: product.slug },
      });
        await tx.orderItem.updateMany({
          where: { productId: product.id },
          data: { productId: target.id },
        });
        await tx.deliveredCode.updateMany({
          where: { productId: product.id },
          data: { productId: target.id },
        });
      } else {
        await tx.productVariant.deleteMany({ where: { productId: product.id } });
      }

      await tx.productMedia.deleteMany({ where: { productId: product.id } });
      await tx.product.delete({ where: { id: product.id } });
    });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error:
          "Some inventory codes already exist under the target parent. Remove duplicate codes before merging.",
      };
    }
    return { ok: false, error: String(error) };
  }
}

export async function convertProductToVariant(
  input: ConvertProductToVariantInput,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  if (input.sourceSlug === input.targetParentSlug) {
    return { ok: false, error: "Choose a different source product." };
  }

  const [source, target] = await Promise.all([
    prisma.product.findUnique({
      where: { slug: input.sourceSlug },
      include: { variants: true },
    }),
    prisma.product.findUnique({
      where: { slug: input.targetParentSlug },
      select: { id: true },
    }),
  ]);
  if (!source) return { ok: false, error: "Source product not found." };
  if (!target) return { ok: false, error: "Target parent product not found." };

  const baseVariantId = source.slug;
  try {
    await prisma.$transaction(async (tx) => {
      // Merging across regions: stamp the moved variants with the source
      // product's region so a single group can hold e.g. FR + US variants and
      // the storefront region selector appears. Falls back to the variant's own
      // region if one was already set explicitly.
      const stampedRegion = normalizeRegion(source.region) || null;

      await tx.productVariant.upsert({
        where: { id: baseVariantId },
        update: {
          productId: target.id,
          name: source.name,
          priceMad: source.priceMad,
          region: stampedRegion,
          active: source.active,
          featured: source.featured,
          stockMode: "automatic",
        },
        create: {
          id: baseVariantId,
          productId: target.id,
          name: source.name,
          priceMad: source.priceMad,
          faceValue: null,
          faceCurrency: "MAD",
          region: stampedRegion,
          stockControl: "manual",
          stockMode: "automatic",
          active: source.active,
          featured: source.featured,
          sortOrder: source.variants.length,
        },
      });

      // Move the remaining variants, stamping region only where it isn't
      // already set (preserve any explicit per-variant region).
      await tx.productVariant.updateMany({
        where: { productId: source.id, id: { not: baseVariantId }, region: null },
        data: { productId: target.id, region: stampedRegion },
      });
      await tx.productVariant.updateMany({
        where: { productId: source.id, id: { not: baseVariantId } },
        data: { productId: target.id },
      });
      await tx.digitalCode.updateMany({
        where: { productId: source.id },
        data: { productId: target.id, variantId: baseVariantId },
      });
      await tx.orderItem.updateMany({
        where: { productId: source.id },
        data: { productId: target.id },
      });
      await tx.deliveredCode.updateMany({
        where: { productId: source.id },
        data: { productId: target.id },
      });

      if (input.removeSource) {
        await tx.product.delete({ where: { id: source.id } });
      } else {
        await tx.product.update({
          where: { id: source.id },
          data: { active: false, featured: false },
        });
      }
    });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error:
          "Some inventory codes already exist under the target parent. Remove duplicates before converting.",
      };
    }
    return { ok: false, error: String(error) };
  }
}

// A listing's region must be one of the fixed region-table codes, or empty
// (unset — rendered as the "incomplete" state, never guessed).
function normalizeRegion(value: string): string {
  const trimmed = value.trim().toUpperCase();
  return isRegionCode(trimmed) ? trimmed : "";
}

export async function saveParentProduct(
  data: SaveParentProductInput,
): Promise<ActionResult> {
  if (!data.slug.trim() || !data.name.trim()) {
    return { ok: false, error: "Slug and name are required." };
  }

  await ensureDatabaseReady();

  const category = await ensureCategoryForProduct(data.category);
  if (!category.ok || !category.id) {
    return { ok: false, error: category.error ?? "Catégorie introuvable." };
  }

  const productData = {
    name: data.name,
    category: category.id,
    brand: data.brand,
    region: normalizeRegion(data.region),
    deliveryType: data.deliveryType,
    description: data.description,
    shortDescription: data.shortDescription,
    longDescription: data.longDescription,
    instructions: data.instructions,
    imageUrl: data.thumbnail || null,
    active: data.active,
    featured: data.featured,
    // Trim/lowercase/de-dupe aliases so search matching stays clean + bounded.
    searchAliases: Array.from(
      new Set(
        (data.searchAliases ?? [])
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 40),
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
  const nextSlug = data.slug.trim();
  const originalSlug = data.originalSlug?.trim() || nextSlug;

  try {
    if (nextSlug.toLowerCase() !== originalSlug.toLowerCase()) {
      const duplicate = await prisma.productVariant.findFirst({
        where: {
          id: { equals: nextSlug, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) {
        return { ok: false, error: "Ce SKU existe déjà. Choisissez un SKU unique." };
      }
    }

    const category = await ensureCategoryForProduct(data.category);
    if (!category.ok || !category.id) {
      return { ok: false, error: category.error ?? "Catégorie introuvable." };
    }

    const product = await timeAdmin(
      "admin.products.saveVariant",
      "product.findUnique.variants",
      () =>
        prisma.product.findUnique({
          where: { slug: data.parentSlug },
          select: {
            id: true,
            slug: true,
            variants: { select: { id: true, name: true } },
          },
        }),
      (row) => (row ? 1 : 0),
    );

    if (!product) return { ok: false, error: "Product not found." };

    // Empty/invalid → null so the variant inherits the parent product's region.
    const variantRegion = data.variantRegion
      ? normalizeRegion(data.variantRegion) || null
      : null;

    const variantFields = {
      name: data.name,
      priceMad: data.priceMad,
      faceValue: data.faceValue,
      faceCurrency: data.faceCurrency,
      supplierCost: data.supplierCost,
      supplierCurrency: data.supplierCurrency,
      region: variantRegion,
      stockControl: data.stockControl,
      stockMode: data.stockMode,
      active: data.active,
      featured: data.featured,
      reloadlyProductId: data.reloadlyProductId,
      reloadlyCountryCode: data.reloadlyCountryCode,
    };

    if ((originalSlug === product.slug || originalSlug === product.id) && product.variants.length === 0) {
      await prisma.$transaction([
        prisma.product.update({
          where: { id: product.id },
          data: {
            name: data.name,
            priceMad: data.priceMad,
            active: data.active,
            category: category.id,
            region: normalizeRegion(data.region),
            deliveryType: data.deliveryType,
          },
        }),
        prisma.productVariant.create({
          data: {
            id: nextSlug,
            productId: product.id,
            ...variantFields,
            sortOrder: 0,
          },
        }),
      ]);
      return { ok: true };
    }

    const existing =
      product.variants.find((variant) => variant.id === originalSlug) ??
      product.variants.find((variant) => variant.id === nextSlug) ??
      product.variants.find((variant) => variant.name === data.name);

    if (existing) {
      await prisma.productVariant.update({
        where: { id: existing.id },
        data: {
          id: nextSlug,
          ...variantFields,
        },
      });
    } else {
      await prisma.productVariant.create({
        data: {
          id: nextSlug,
          productId: product.id,
          ...variantFields,
          sortOrder: product.variants.length,
        },
      });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Persist a new display order for a parent product's variants.
 *
 * `orderedSlugs` is the full list of the parent's variant SKUs in the desired
 * order. We write each variant's array index into `sortOrder`, which is what
 * every read path orders by ([{ sortOrder: "asc" }, ...]). The caller only
 * needs to supply the order; the numeric values are derived here so they stay
 * dense and gap-free.
 */
export async function reorderVariants(
  parentSlug: string,
  orderedSlugs: string[],
): Promise<ActionResult> {
  await ensureDatabaseReady();

  const product = await prisma.product.findUnique({
    where: { slug: parentSlug },
    select: { id: true, variants: { select: { id: true } } },
  });
  if (!product) return { ok: false, error: "Product not found." };

  const known = new Set(product.variants.map((variant) => variant.id));
  // Guard against a stale client: the incoming order must reference exactly the
  // variants that currently exist, so we never leave some rows unordered.
  if (
    orderedSlugs.length !== known.size ||
    !orderedSlugs.every((slug) => known.has(slug))
  ) {
    return { ok: false, error: "Variant list is out of date. Reload and retry." };
  }

  try {
    await prisma.$transaction(
      orderedSlugs.map((slug, index) =>
        prisma.productVariant.update({
          where: { id: slug },
          data: { sortOrder: index },
        }),
      ),
    );
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
