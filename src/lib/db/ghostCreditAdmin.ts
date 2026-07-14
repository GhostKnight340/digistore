import "server-only";

import { randomUUID } from "crypto";
import { prisma, ensureDatabaseReady } from "./prisma";
import { grantCreditTx, debitCreditTx } from "./ghostCredit";
import type { ActionResult } from "@/lib/dto";

/**
 * Admin-safe manual Ghost Credit correction. Grants or reverses credit for a
 * customer (looked up by email) with a MANDATORY reason, always appending a new
 * ledger row — historical rows are never edited. A fresh idempotency key per
 * call means an intentional repeat is a distinct correction (the guard against
 * duplicates lives in the automated flows, not here).
 */
export async function adminAdjustGhostCredit(input: {
  customerEmail: string;
  direction: "credit" | "debit";
  amountMad: number;
  reason: string;
  actor: string;
}): Promise<ActionResult> {
  await ensureDatabaseReady();
  const email = input.customerEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "E-mail client requis." };
  if (!Number.isFinite(input.amountMad) || input.amountMad <= 0) {
    return { ok: false, error: "Le montant doit être supérieur à 0." };
  }
  if (!input.reason.trim()) return { ok: false, error: "Un motif est obligatoire." };

  const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
  if (!customer) return { ok: false, error: "Aucun compte client avec cet e-mail." };

  const amountMad = Math.round(input.amountMad);
  const key = `admin-adjust:${input.direction}:${randomUUID()}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.direction === "credit") {
        return grantCreditTx(tx, {
          customerId: customer.id,
          amountMad,
          reason: "admin_grant",
          idempotencyKey: key,
          source: input.actor,
          note: input.reason.trim(),
        });
      }
      return debitCreditTx(tx, {
        customerId: customer.id,
        amountMad,
        reason: "admin_reversal",
        idempotencyKey: key,
        source: input.actor,
        note: input.reason.trim(),
        // Admin can only debit what exists; a request beyond the balance is
        // rejected rather than silently clamped, so the admin sees the real state.
        allowNegative: false,
      });
    });
    if (input.direction === "debit" && "wouldGoNegative" in result && result.wouldGoNegative) {
      return { ok: false, error: "Le montant dépasse le solde disponible du client." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[adminAdjustGhostCredit]", error);
    return { ok: false, error: "Correction impossible." };
  }
}
