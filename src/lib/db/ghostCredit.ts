import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import type { GhostCreditWalletDTO, GhostCreditTransactionDTO } from "@/lib/dto";
import type { PromoRewardType, GhostCreditDirection, GhostCreditStatus } from "@/lib/types";

/**
 * Ghost Credit ledger.
 *
 * The wallet balance is DERIVED from an append-only ledger of
 * GhostCreditTransaction rows, and cached on Customer.ghostCreditBalanceMad
 * strictly inside the same transaction as the ledger write. A credit adds; a
 * debit (including reversals) subtracts. Historical rows are never mutated or
 * deleted — corrections are new rows. Every write is idempotent via a unique
 * idempotencyKey, so duplicate webhooks / retried admin actions / double
 * completion runs can never double-grant or double-reverse.
 */

type Tx = Prisma.TransactionClient;

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** Signed contribution of a ledger row to the balance (credits +, debits −). */
function signedAmount(row: { direction: string; amountMad: number }): number {
  return row.direction === "credit" ? row.amountMad : -row.amountMad;
}

/**
 * Re-derive a customer's balance from the full ledger. `active` credits count
 * positively; `active` debits count negatively. `reversed`/`expired` credits are
 * excluded, and their offsetting debit is also excluded, so the two never
 * double-count. This is the source-of-truth check for the cached balance.
 */
export async function deriveBalance(customerId: string): Promise<number> {
  const rows = await prisma.ghostCreditTransaction.findMany({
    where: { customerId, status: "active" },
    select: { direction: true, amountMad: true },
  });
  return rows.reduce((sum, row) => sum + signedAmount(row), 0);
}

interface GrantParams {
  customerId: string;
  amountMad: number;
  reason: string;
  idempotencyKey: string;
  promoCodeId?: string | null;
  orderId?: string | null;
  rewardType?: PromoRewardType | null;
  eligibleSubtotalMad?: number | null;
  configuredPercent?: number | null;
  configuredFixedMad?: number | null;
  expiresAt?: Date | null;
  source?: string;
  note?: string | null;
}

export interface LedgerWriteResult {
  ok: boolean;
  /** True when this exact idempotencyKey already existed (no-op). */
  duplicate: boolean;
  balanceMad?: number;
}

/**
 * Grant Ghost Credit inside an existing transaction. Idempotent: if a row with
 * the same idempotencyKey exists it is a no-op. Updates the cached balance in
 * the same tx.
 */
export async function grantCreditTx(tx: Tx, params: GrantParams): Promise<LedgerWriteResult> {
  if (params.amountMad <= 0) return { ok: true, duplicate: false };
  const existing = await tx.ghostCreditTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { ok: true, duplicate: true };

  await tx.ghostCreditTransaction.create({
    data: {
      customerId: params.customerId,
      amountMad: params.amountMad,
      direction: "credit",
      reason: params.reason,
      promoCodeId: params.promoCodeId ?? null,
      orderId: params.orderId ?? null,
      rewardType: params.rewardType ?? null,
      eligibleSubtotalMad: params.eligibleSubtotalMad ?? null,
      configuredPercent: params.configuredPercent ?? null,
      configuredFixedMad: params.configuredFixedMad ?? null,
      status: "active",
      idempotencyKey: params.idempotencyKey,
      expiresAt: params.expiresAt ?? null,
      source: params.source ?? "system",
      note: params.note ?? null,
    },
  });
  const customer = await tx.customer.update({
    where: { id: params.customerId },
    data: { ghostCreditBalanceMad: { increment: params.amountMad } },
    select: { ghostCreditBalanceMad: true },
  });
  return { ok: true, duplicate: false, balanceMad: customer.ghostCreditBalanceMad };
}

interface DebitParams extends Omit<GrantParams, "reason"> {
  reason: string;
  /**
   * When true (default), the debit is capped so the wallet never goes negative,
   * unless allowNegative is set. Reversals of already-spent credit that would go
   * negative are surfaced to the caller instead of silently clamping.
   */
  allowNegative?: boolean;
}

/**
 * Debit Ghost Credit inside a transaction (reversal, expiration, spend).
 * Idempotent by idempotencyKey. Returns `wouldGoNegative` when the requested
 * debit exceeds the current balance and negatives are not allowed — the caller
 * (refund flow) uses this to flag the case for admin review rather than writing
 * an unexplained negative balance.
 */
export async function debitCreditTx(
  tx: Tx,
  params: DebitParams,
): Promise<LedgerWriteResult & { wouldGoNegative?: boolean; appliedMad?: number }> {
  if (params.amountMad <= 0) return { ok: true, duplicate: false };
  const existing = await tx.ghostCreditTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { ok: true, duplicate: true };

  const customer = await tx.customer.findUnique({
    where: { id: params.customerId },
    select: { ghostCreditBalanceMad: true },
  });
  const balance = customer?.ghostCreditBalanceMad ?? 0;
  const allowNegative = params.allowNegative ?? false;
  const wouldGoNegative = params.amountMad > balance;
  const applied = allowNegative ? params.amountMad : Math.min(params.amountMad, Math.max(0, balance));

  if (applied <= 0) {
    return { ok: true, duplicate: false, wouldGoNegative, appliedMad: 0 };
  }

  await tx.ghostCreditTransaction.create({
    data: {
      customerId: params.customerId,
      amountMad: applied,
      direction: "debit",
      reason: params.reason,
      promoCodeId: params.promoCodeId ?? null,
      orderId: params.orderId ?? null,
      rewardType: params.rewardType ?? null,
      status: "active",
      idempotencyKey: params.idempotencyKey,
      source: params.source ?? "system",
      note: params.note ?? null,
    },
  });
  await tx.customer.update({
    where: { id: params.customerId },
    data: { ghostCreditBalanceMad: { decrement: applied } },
  });
  return { ok: true, duplicate: false, wouldGoNegative, appliedMad: applied };
}

function buildTransactionDTO(row: {
  id: string;
  amountMad: number;
  direction: string;
  reason: string;
  status: string;
  orderId: string | null;
  rewardType: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  note: string | null;
  promoCode: { code: string } | null;
}): GhostCreditTransactionDTO {
  return {
    id: row.id,
    amountMad: row.amountMad,
    direction: row.direction as GhostCreditDirection,
    reason: row.reason,
    status: row.status as GhostCreditStatus,
    orderId: row.orderId,
    promoCode: row.promoCode?.code ?? null,
    rewardType: (row.rewardType as PromoRewardType | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: iso(row.expiresAt),
    note: row.note,
  };
}

/** Wallet balance + ledger history for the account wallet page. */
export async function getGhostCreditWallet(customerId: string): Promise<GhostCreditWalletDTO> {
  await ensureDatabaseReady();
  const [customer, rows] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { ghostCreditBalanceMad: true } }),
    prisma.ghostCreditTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        amountMad: true,
        direction: true,
        reason: true,
        status: true,
        orderId: true,
        rewardType: true,
        createdAt: true,
        expiresAt: true,
        note: true,
        promoCode: { select: { code: true } },
      },
    }),
  ]);
  return {
    balanceMad: customer?.ghostCreditBalanceMad ?? 0,
    transactions: rows.map(buildTransactionDTO),
  };
}
