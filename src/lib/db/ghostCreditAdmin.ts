import "server-only";

import { prisma, ensureDatabaseReady } from "./prisma";
import { grantCreditTx, debitCreditTx, ghostCreditInactivityDays } from "./ghostCredit";
import { manualCreditKey } from "@/lib/promo/ledgerMath";
import type { ActionResult } from "@/lib/dto";

/**
 * Admin-safe manual Ghost Credit correction. Grants or reverses credit for a
 * customer (looked up by email) with a MANDATORY reason, always appending a new
 * ledger row — historical rows are never edited.
 *
 * Idempotent per `requestId`: the admin UI generates one id when the form opens,
 * so a double-submit / retried click resolves to the same ledger entry instead
 * of a second correction (idempotencyKey = "manual-credit:{requestId}").
 */
export async function adminAdjustGhostCredit(input: {
  customerEmail: string;
  direction: "credit" | "debit";
  amountMad: number;
  reason: string;
  actor: string;
  /** Stable per-request id from the admin UI, for idempotency. */
  requestId: string;
}): Promise<ActionResult> {
  await ensureDatabaseReady();
  const email = input.customerEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "E-mail client requis." };
  if (!Number.isFinite(input.amountMad) || input.amountMad <= 0) {
    return { ok: false, error: "Le montant doit être supérieur à 0." };
  }
  if (!Number.isSafeInteger(Math.round(input.amountMad)) || input.amountMad > 1_000_000_000) {
    return { ok: false, error: "Montant hors limites." };
  }
  if (!input.reason.trim()) return { ok: false, error: "Un motif est obligatoire." };
  if (!input.requestId?.trim()) return { ok: false, error: "Requête invalide." };

  const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
  if (!customer) return { ok: false, error: "Aucun compte client avec cet e-mail." };

  const amountMad = Math.round(input.amountMad);
  const key = manualCreditKey(input.requestId.trim());
  const inactivityDays = await ghostCreditInactivityDays();

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.direction === "credit") {
        return grantCreditTx(tx, {
          customerId: customer.id,
          amountMad,
          reason: "admin_grant",
          idempotencyKey: key,
          // Manual grants NEVER reset the timer and do not count as qualifying.
          resetsExpiration: false,
          inactivityDays,
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

/** Admin: freeze or unfreeze a customer's wallet (blocks spending). Reason
 *  mandatory. Never mutates the balance or ledger. */
export async function adminSetWalletFrozen(input: {
  customerEmail: string;
  frozen: boolean;
  reason: string;
  actor: string;
}): Promise<ActionResult> {
  await ensureDatabaseReady();
  const email = input.customerEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "E-mail client requis." };
  if (!input.reason.trim()) return { ok: false, error: "Un motif est obligatoire." };
  const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
  if (!customer) return { ok: false, error: "Aucun compte client avec cet e-mail." };

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      walletFrozen: input.frozen,
      walletFrozenReason: input.frozen ? `${input.reason.trim()} (${input.actor})` : null,
    },
  });
  console.info(
    `[ghost-credit] wallet.${input.frozen ? "frozen" : "unfrozen"}`,
    JSON.stringify({ customerId: customer.id, actor: input.actor }),
  );
  return { ok: true };
}
