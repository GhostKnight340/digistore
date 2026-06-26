import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import type { ActionResult, AdminCodeDTO, InventoryGroupDTO, InventorySummaryDTO } from "@/lib/dto";

type CodeRecord = {
  id: string;
  code: string;
  status: string;
  assignedOrderId: string | null;
  usedAt: Date | null;
  createdAt: Date;
};

function rowToCode(code: CodeRecord): AdminCodeDTO {
  return {
    id: code.id,
    code: code.code,
    status: code.status,
    assignedOrderId: code.assignedOrderId,
    usedAt: code.usedAt?.toISOString() ?? null,
    createdAt: code.createdAt.toISOString(),
  };
}

export async function getInventorySummary(): Promise<InventorySummaryDTO[]> {
  await ensureDatabaseReady();
  const [productRows, statusGroups] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { slug: "asc" },
    }),
    prisma.digitalCode.groupBy({
      by: ["productId", "status"],
      _count: { _all: true },
    }),
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
    if (row.status === "unused") s.unused = count;
    else if (row.status === "reserved") s.reserved = count;
    else if (row.status === "used") s.used = count;
    else if (row.status === "disabled") s.disabled = count;
  }

  return [...result.values()];
}

export async function getInventoryGroups(): Promise<InventoryGroupDTO[]> {
  await ensureDatabaseReady();
  const products = await prisma.product.findMany({
    take: 100,
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      digitalCodes: {
        take: 100,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          status: true,
          assignedOrderId: true,
          usedAt: true,
          createdAt: true,
        },
      },
    },
  });
  const counts = await prisma.digitalCode.groupBy({
    by: ["productId", "status"],
    where: { productId: { in: products.map((product) => product.id) } },
    _count: { _all: true },
  });
  const countByProduct = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const current = countByProduct.get(row.productId) ?? {};
    current[row.status] = row._count._all;
    countByProduct.set(row.productId, current);
  }

  return products.map((product) => {
    const codes = product.digitalCodes.map(rowToCode);
    const count = (status: string) => countByProduct.get(product.id)?.[status] ?? 0;

    return {
      productId: product.slug,
      productName: product.name,
      total: codes.length,
      unused: count("unused"),
      reserved: count("reserved"),
      used: count("used"),
      disabled: count("disabled"),
      codes,
    };
  });
}

export async function getAvailableCodes(
  productSlug: string,
): Promise<AdminCodeDTO[]> {
  await ensureDatabaseReady();
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: {
      digitalCodes: {
        where: { status: "unused" },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return product?.digitalCodes.map(rowToCode) ?? [];
}

export async function addCode(
  productSlug: string,
  code: string,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Code is empty." };

  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) return { ok: false, error: "Unknown product." };

  try {
    await prisma.digitalCode.create({
      data: {
        productId: product.id,
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
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  await ensureDatabaseReady();
  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) return { ok: false, error: "Unknown product." };

  const codes = Array.from(
    new Set(raw.split(/\r?\n/).map((code) => code.trim()).filter(Boolean)),
  );
  if (codes.length === 0) return { ok: false, error: "No codes provided." };

  const result = await prisma.digitalCode.createMany({
    data: codes.map((code) => ({
      productId: product.id,
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
