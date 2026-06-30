import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import type {
  ActionResult,
  AdminCodeDTO,
  InventoryGroupDTO,
  InventoryProductDTO,
  InventorySummaryDTO,
  InventoryVariantDTO,
} from "@/lib/dto";

type CodeRecord = {
  id: string;
  code: string;
  status: string;
  variantId: string | null;
  assignedOrderId: string | null;
  usedAt: Date | null;
  createdAt: Date;
};

type InventoryCounts = {
  unused: number;
  reserved: number;
  used: number;
  disabled: number;
  total: number;
  lastUpdatedAt: string | null;
};

const EMPTY_COUNTS: InventoryCounts = {
  unused: 0,
  reserved: 0,
  used: 0,
  disabled: 0,
  total: 0,
  lastUpdatedAt: null,
};

function rowToCode(code: CodeRecord): AdminCodeDTO {
  return {
    id: code.id,
    code: code.code,
    status: code.status,
    variantId: code.variantId,
    assignedOrderId: code.assignedOrderId,
    usedAt: code.usedAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
  };
}

function addCounts(target: InventoryCounts, source: InventoryCounts) {
  target.unused += source.unused;
  target.reserved += source.reserved;
  target.used += source.used;
  target.disabled += source.disabled;
  target.total += source.total;
  if (
    source.lastUpdatedAt &&
    (!target.lastUpdatedAt || source.lastUpdatedAt > target.lastUpdatedAt)
  ) {
    target.lastUpdatedAt = source.lastUpdatedAt;
  }
}

function variantDisplayName(productName: string, parentName: string) {
  const escaped = parentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutParent = productName.replace(new RegExp(`^${escaped}\\s*`, "i"), "").trim();
  return withoutParent || productName;
}

function countsForProduct(
  productId: string,
  rows: Array<{
    productId: string;
    variantId: string | null;
    status: string;
    _count: { _all: number };
    _max: { updatedAt: Date | null };
  }>,
  variantId?: string | null,
): InventoryCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    if (row.productId !== productId) continue;
    if (variantId !== undefined && row.variantId !== variantId) continue;
    const count = row._count._all;
    counts.total += count;
    if (row.status === "unused") counts.unused += count;
    else if (row.status === "reserved") counts.reserved += count;
    else if (row.status === "used") counts.used += count;
    else if (row.status === "disabled") counts.disabled += count;
    const updatedAt = row._max.updatedAt?.toISOString() ?? null;
    if (updatedAt && (!counts.lastUpdatedAt || updatedAt > counts.lastUpdatedAt)) {
      counts.lastUpdatedAt = updatedAt;
    }
  }
  return counts;
}

export async function getInventorySummary(): Promise<InventorySummaryDTO[]> {
  await ensureDatabaseReady();
  const [productRows, statusGroups] = await Promise.all([
    timeAdmin(
      "admin.inventorySummary",
      "product.findMany.summary",
      () =>
        prisma.product.findMany({
          select: { id: true, slug: true, name: true },
          orderBy: { slug: "asc" },
        }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.inventorySummary",
      "digitalCode.groupBy.status",
      () =>
        prisma.digitalCode.groupBy({
          by: ["productId", "variantId", "status"],
          _count: { _all: true },
        }),
      (rows) => rows.length,
    ),
  ]);

  const productMap = new Map(productRows.map((p) => [p.id, p]));
  const result = new Map<string, InventorySummaryDTO>();

  for (const row of statusGroups) {
    const product = productMap.get(row.productId);
    if (!product) continue;
    if (!result.has(product.slug)) {
      result.set(product.slug, {
        productId: product.slug,
        productName: product.name,
        unused: 0,
        reserved: 0,
        used: 0,
        disabled: 0,
        total: 0,
      });
    }
    const s = result.get(product.slug)!;
    const count = row._count._all;
    s.total += count;
    if (row.status === "unused") s.unused += count;
    else if (row.status === "reserved") s.reserved += count;
    else if (row.status === "used") s.used += count;
    else if (row.status === "disabled") s.disabled += count;
  }

  return [...result.values()];
}

export async function getInventoryGroups(): Promise<InventoryGroupDTO[]> {
  await ensureDatabaseReady();
  const summaries = await getInventorySummary();
  return summaries.map((summary) => ({ ...summary, codes: [] }));
}

export async function getInventoryProducts(): Promise<InventoryProductDTO[]> {
  await ensureDatabaseReady();
  const [products, statusGroups] = await Promise.all([
    timeAdmin(
      "admin.inventoryProducts",
      "product.findMany.inventory",
      () =>
        prisma.product.findMany({
          take: 300,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            slug: true,
            name: true,
            category: true,
            categoryRecord: { select: { name: true } },
            variants: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              select: {
                id: true,
                name: true,
                faceValue: true,
                faceCurrency: true,
              },
            },
          },
        }),
      (rows) => rows.length,
    ),
    timeAdmin(
      "admin.inventoryProducts",
      "digitalCode.groupBy.status",
      () =>
        prisma.digitalCode.groupBy({
          by: ["productId", "variantId", "status"],
          _count: { _all: true },
          _max: { updatedAt: true },
        }),
      (rows) => rows.length,
    ),
  ]);

  const grouped = new Map<string, InventoryProductDTO>();

  for (const product of products) {
    const legacyCounts = countsForProduct(product.id, statusGroups, null);
    const parentName =
      product.variants.length > 0
        ? product.name
        : product.categoryRecord?.name ?? product.category;
    const groupKey =
      product.variants.length > 0 ? product.slug : `category:${product.category}`;
    const variants: InventoryVariantDTO[] =
      product.variants.length > 0
        ? [
            ...product.variants.map((variant) => ({
              productId: product.slug,
              variantId: variant.id,
              name:
                variant.faceValue != null
                  ? `${variant.faceValue} ${variant.faceCurrency}`
                  : variant.name,
              legacy: false,
              ...countsForProduct(product.id, statusGroups, variant.id),
            })),
            ...(legacyCounts.total > 0
              ? [
                  {
                    productId: product.slug,
                    variantId: null,
                    name: "Codes hérités non assignés",
                    legacy: true,
                    ...legacyCounts,
                  },
                ]
              : []),
          ]
        : [
            {
              productId: product.slug,
              variantId: null,
              name: variantDisplayName(product.name, parentName),
              legacy: true,
              ...legacyCounts,
            },
          ];

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        productId: product.variants.length > 0 ? product.slug : product.category,
        productName: parentName,
        category: product.category,
        variantCount: 0,
        unused: 0,
        reserved: 0,
        used: 0,
        disabled: 0,
        total: 0,
        lastUpdatedAt: null,
        variants: [],
      });
    }

    const group = grouped.get(groupKey)!;
    group.variants.push(...variants);
    group.variantCount = group.variants.length;
    for (const variant of variants) addCounts(group, variant);
  }

  return [...grouped.values()].filter((group) => group.variants.length > 0);
}

async function resolveInventoryTarget(targetId: string): Promise<{
  productId: string;
  productSlug: string;
  variantId: string | null;
  hasVariants: boolean;
} | null> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: targetId },
    select: { id: true, productId: true, product: { select: { slug: true } } },
  });
  if (variant) {
    return {
      productId: variant.productId,
      productSlug: variant.product.slug,
      variantId: variant.id,
      hasVariants: true,
    };
  }

  const product = await prisma.product.findUnique({
    where: { slug: targetId },
    select: { id: true, slug: true, _count: { select: { variants: true } } },
  });
  if (!product) return null;
  return {
    productId: product.id,
    productSlug: product.slug,
    variantId: null,
    hasVariants: product._count.variants > 0,
  };
}

export async function getInventoryCodes(
  targetId: string,
  take = 100,
): Promise<AdminCodeDTO[]> {
  await ensureDatabaseReady();
  const target = await timeAdmin(
    "admin.inventoryCodes",
    "inventory.resolveTarget",
    () => resolveInventoryTarget(targetId),
    (row) => (row ? 1 : 0),
  );
  if (!target) return [];

  const codes = await timeAdmin(
    "admin.inventoryCodes",
    "digitalCode.findMany.product",
    () =>
        prisma.digitalCode.findMany({
        where: { productId: target.productId, variantId: target.variantId },
        take,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          variantId: true,
          assignedOrderId: true,
          usedAt: true,
          createdAt: true,
        },
      }),
    (rows) => rows.length,
  );

  return codes.map(rowToCode);
}

export async function getAvailableCodes(
  targetId: string,
): Promise<AdminCodeDTO[]> {
  await ensureDatabaseReady();
  const target = await timeAdmin(
    "admin.availableCodes",
    "inventory.resolveTarget",
    () => resolveInventoryTarget(targetId),
    (row) => (row ? 1 : 0),
  );
  if (!target) return [];

  const codes = await timeAdmin(
    "admin.availableCodes",
    "digitalCode.findMany.unused",
    () =>
        prisma.digitalCode.findMany({
        where: {
          productId: target.productId,
          variantId: target.variantId,
          status: "unused",
        },
        take: 200,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          variantId: true,
          assignedOrderId: true,
          usedAt: true,
          createdAt: true,
        },
      }),
    (rows) => rows.length,
  );

  return codes.map(rowToCode);
}

export async function addCode(
  targetId: string,
  code: string,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Code is empty." };

  const target = await resolveInventoryTarget(targetId);
  if (!target) return { ok: false, error: "Unknown product or variant." };
  if (target.hasVariants && !target.variantId) {
    return { ok: false, error: "Add new codes to a specific variant." };
  }

  try {
    await prisma.digitalCode.create({
      data: {
        productId: target.productId,
        variantId: target.variantId,
        code: trimmed,
        status: "unused",
      },
    });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "Code already exists for this product." };
    }
    return { ok: false, error: "Code could not be added." };
  }
}

export async function addCodesBulk(
  targetId: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  await ensureDatabaseReady();
  const target = await resolveInventoryTarget(targetId);
  if (!target) return { ok: false, error: "Unknown product or variant." };
  if (target.hasVariants && !target.variantId) {
    return { ok: false, error: "Add new codes to a specific variant." };
  }

  const codes = Array.from(
    new Set(raw.split(/\r?\n/).map((code) => code.trim()).filter(Boolean)),
  );
  if (codes.length === 0) return { ok: false, error: "No codes provided." };

  const result = await prisma.digitalCode.createMany({
    data: codes.map((code) => ({
      productId: target.productId,
      variantId: target.variantId,
      code,
      status: "unused",
    })),
    skipDuplicates: true,
  });

  return {
    ok: true,
    added: result.count,
    skipped: codes.length - result.count,
  };
}

export async function disableCode(codeId: string): Promise<ActionResult> {
  await ensureDatabaseReady();
  const code = await prisma.digitalCode.findUnique({ where: { id: codeId } });
  if (!code) return { ok: false, error: "Code not found." };
  if (code.status === "used") {
    return { ok: false, error: "Cannot disable a code that has been used." };
  }

  await prisma.digitalCode.update({
    where: { id: codeId },
    data: { status: "disabled" },
  });

  return { ok: true };
}
