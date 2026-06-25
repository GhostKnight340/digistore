import "server-only";

import { getDb, newId, nowIso } from "./sqlite";
import type { ActionResult, AdminCodeDTO, InventoryGroupDTO } from "@/lib/dto";

function rowToCode(c: Record<string, unknown>): AdminCodeDTO {
  return {
    id: c.id as string,
    code: c.code as string,
    status: c.status as string,
    assignedOrderId: (c.assignedOrderId as string) ?? null,
    usedAt: (c.usedAt as string) ?? null,
    createdAt: c.createdAt as string,
  };
}

export async function getInventoryGroups(): Promise<InventoryGroupDTO[]> {
  const db = getDb();
  const products = db.prepare("SELECT id, slug, name FROM Product ORDER BY slug ASC").all();

  return products.map((p) => {
    const codes = db.prepare(
      "SELECT * FROM DigitalCode WHERE productId = ? ORDER BY createdAt ASC",
    ).all(p.id as string).map(rowToCode);

    const count = (s: string) => codes.filter((c) => c.status === s).length;
    return {
      productId: p.slug as string,
      productName: p.name as string,
      total: codes.length,
      unused: count("unused"),
      reserved: count("reserved"),
      used: count("used"),
      disabled: count("disabled"),
      codes,
    };
  });
}

export async function getAvailableCodes(productSlug: string): Promise<AdminCodeDTO[]> {
  const db = getDb();
  const product = db.prepare("SELECT id FROM Product WHERE slug = ?").get(productSlug);
  if (!product) return [];
  return db.prepare(
    "SELECT * FROM DigitalCode WHERE productId = ? AND status = 'unused' ORDER BY createdAt ASC",
  ).all(product.id as string).map(rowToCode);
}

export async function addCode(productSlug: string, code: string): Promise<ActionResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "Code is empty." };
  const db = getDb();
  const product = db.prepare("SELECT id FROM Product WHERE slug = ?").get(productSlug);
  if (!product) return { ok: false, error: "Unknown product." };
  try {
    const ts = nowIso();
    db.prepare(
      "INSERT INTO DigitalCode (id, productId, code, status, createdAt, updatedAt) VALUES (?, ?, ?, 'unused', ?, ?)",
    ).run(newId(), product.id as string, trimmed, ts, ts);
    return { ok: true };
  } catch {
    return { ok: false, error: "Code already exists for this product." };
  }
}

export async function addCodesBulk(
  productSlug: string,
  raw: string,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  const db = getDb();
  const product = db.prepare("SELECT id FROM Product WHERE slug = ?").get(productSlug);
  if (!product) return { ok: false, error: "Unknown product." };

  const codes = Array.from(
    new Set(
      raw.split(/\r?\n/).map((c) => c.trim()).filter(Boolean),
    ),
  );
  if (codes.length === 0) return { ok: false, error: "No codes provided." };

  let added = 0;
  let skipped = 0;
  const ts = nowIso();

  for (const code of codes) {
    try {
      db.prepare(
        "INSERT INTO DigitalCode (id, productId, code, status, createdAt, updatedAt) VALUES (?, ?, ?, 'unused', ?, ?)",
      ).run(newId(), product.id as string, code, ts, ts);
      added += 1;
    } catch {
      skipped += 1;
    }
  }
  return { ok: true, added, skipped };
}

export async function disableCode(codeId: string): Promise<ActionResult> {
  const db = getDb();
  const code = db.prepare("SELECT id, status FROM DigitalCode WHERE id = ?").get(codeId);
  if (!code) return { ok: false, error: "Code not found." };
  if (code.status === "used") return { ok: false, error: "Cannot disable a code that has been used." };
  db.prepare("UPDATE DigitalCode SET status = 'disabled', updatedAt = ? WHERE id = ?").run(nowIso(), codeId);
  return { ok: true };
}
