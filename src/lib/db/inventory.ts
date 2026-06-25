import "server-only";

import { prisma } from "@/lib/prisma";
import type { ActionResult, AdminCodeDTO, InventoryGroupDTO } from "@/lib/dto";

/** Admin: full inventory grouped by product with status counts. */
export async function getInventoryGroups(): Promise<InventoryGroupDTO[]> {
  const products = await prisma.product.findMany({
    orderBy: { slug: "asc" },
    include: { digitalCodes: { orderBy: { createdAt: "asc" } } },
  });

  return products.map((p) => {
    const codes: AdminCodeDTO[] = p.digitalCodes.map((c) => ({
      id: c.id,
      code: c.code,
      status: c.status,
      assignedOrderId: c.assignedOrderId,
      usedAt: c.usedAt ? c.usedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
    const count = (s: string) => codes.filter((c) => c.status === s).length;
    return {
      productId: p.slug,
      productName: p.name,
      total: codes.length,
      unused: count("unused"),
      reserved: count("reserved"),
      used: count("used"),
      disabled: count("disabled"),
      codes,
    };
  });
}

/**
 * Admin: unused codes available for a product (used during fulfillment).
 * Never returns used/reserved/disabled codes.
 */
export async function getAvailableCodes(
  productSlug: string,
): Promise<AdminCodeDTO[]> {
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
  });
  if (!product) return [];
  const codes = await prisma.digitalCode.findMany({
    where: { productId: product.id, status: "unused" },
    orderBy: { createdAt: "asc" },
  });
  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    status: c.status,
    assignedOrderId: c.assignedOrderId,
    usedAt: c.usedAt ? c.usedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));
}

/** Admin: add a single code to a product's inventory. */
export async function addCode(
  productSlug: string,
  code: string,
): Promise<ActionResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Code is empty." };
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
  });
  if (!product) return { ok: false, error: "Unknown product." };
  try {
    await prisma.digitalCode.create({
      data: { productId: product.id, code: trimmed, status: "unused" },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Code already exists for this product." };
  }
}

/** Admin: bulk-add codes (one per line). Returns how many were added/skipped. */
export async function addCodesBulk(
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
  });
  if (!product) return { ok: false, error: "Unknown product." };

  const codes = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  );
  if (codes.length === 0) return { ok: false, error: "No codes provided." };

  let added = 0;
  let skipped = 0;
  for (const code of codes) {
    try {
      await prisma.digitalCode.create({
        data: { productId: product.id, code, status: "unused" },
      });
      added += 1;
    } catch {
      // Duplicate (unique productId+code) — skip silently.
      skipped += 1;
    }
  }
  return { ok: true, added, skipped };
}

/**
 * Admin: reset a used/reserved code back to unused so it can be reassigned.
 * Clears assignedOrderId, reservedAt, and usedAt. Does NOT touch DeliveredCode
 * records — the audit trail of what was delivered to the customer is preserved.
 */
export async function resetCode(codeId: string): Promise<ActionResult> {
  const code = await prisma.digitalCode.findUnique({ where: { id: codeId } });
  if (!code) return { ok: false, error: "Code not found." };
  if (code.status === "unused") return { ok: false, error: "Code is already unused." };
  if (code.status === "disabled") return { ok: false, error: "Re-enable the code before resetting." };
  await prisma.digitalCode.update({
    where: { id: codeId },
    data: { status: "unused", assignedOrderId: null, reservedAt: null, usedAt: null },
  });
  return { ok: true };
}
export async function disableCode(codeId: string): Promise<ActionResult> {
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
