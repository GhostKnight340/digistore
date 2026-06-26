import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";
import type { ActionResult, AdminCodeDTO, InventoryGroupDTO } from "@/lib/dto";

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

export async function getVariantStockModes(
  productIds: string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  await ensureDatabaseReady();
  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: productIds } },
    select: { productId: true, stockMode: true },
  });
  return new Map(variants.map((v) => [v.productId, v.stockMode]));
}

export async function getInventoryGroups(): Promise<InventoryGroupDTO[]> {
  await ensureDatabaseReady();
  const products = await prisma.product.findMany({
    orderBy: { slug: "asc" },
    include: {
      digitalCodes: { orderBy: { createdAt: "asc" } },
    },
  });

  return products.map((product) => {
    const codes = product.digitalCodes.map(rowToCode);
    const count = (status: string) =>
      codes.filter((code) => code.status === status).length;

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
