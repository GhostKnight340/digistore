import "server-only";

import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { capDebit, walletExpireKey, computeExpiryDecision } from "@/lib/promo/ledgerMath";
import type { GhostCreditWalletDTO, GhostCreditTransactionDTO } from "@/lib/dto";
import type { PromoRewardType, GhostCreditDirection, GhostCreditStatus } from "@/lib/types";

/**
 * Structured wallet log. Internal ids + amounts only — never email/PII. Wallet
 * money movements are financial events, so they are always logged for audit.
 */
function walletLog(event: string, data: Record<string, unknown>): void {
  try {
    console.info(`[ghost-credit] ${event}`, JSON.stringify(data));
  } catch {
    /* logging must never break a wallet write */
  }
}

/** True for a unique-constraint violation (idempotency-key race). */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Take a transactional row lock on the customer wallet so a read-then-write
 * (balance read → conditional debit / expiry) is atomic against every other
 * concurrent wallet mutation for the same customer. Postgres holds this until
 * the surrounding transaction commits, serializing wallet writes per customer
 * and making overspend impossible under concurrent requests. Re-entrant within
 * a transaction that already holds the lock.
 */
async function lockWallet(tx: Tx, customerId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
}

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

/**
 * Default days of INACTIVITY before Ghost Credit expires. "Inactivity" means no
 * QUALIFYING earned credit — only a promo Ghost Credit reward or a spending-
 * milestone reward from a paid+completed order resets the timer. Spending,
 * manual grants, refunds, and reversals never reset it. Configurable in store
 * settings (ghostCredit.inactivityDays); this is the fallback.
 */
export const GHOST_CREDIT_DEFAULT_INACTIVITY_DAYS = 180;

/** Resolve the configured inactivity period (days) from store settings. */
export async function ghostCreditInactivityDays(): Promise<number> {
  const { getStoreSettings } = await import("./catalog");
  const settings = await getStoreSettings();
  const days = settings.ghostCredit?.inactivityDays;
  return typeof days === "number" && days > 0 ? Math.round(days) : GHOST_CREDIT_DEFAULT_INACTIVITY_DAYS;
}

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
  /**
   * Whether this is a QUALIFYING earning event that resets the inactivity timer.
   * TRUE only for promo Ghost Credit rewards and spending-milestone rewards from
   * paid+completed orders. Never inferred — always set explicitly by the caller.
   */
  resetsExpiration?: boolean;
  /** Configured inactivity period (days); falls back to the 180-day default. */
  inactivityDays?: number;
  /** Timestamp of the earning event (defaults to now). */
  earnedAt?: Date;
  promoCodeId?: string | null;
  orderId?: string | null;
  rewardType?: PromoRewardType | null;
  eligibleSubtotalMad?: number | null;
  configuredPercent?: number | null;
  configuredFixedMad?: number | null;
  milestoneId?: string | null;
  thresholdMad?: number | null;
  qualifyingSpendMad?: number | null;
  relatedTransactionId?: string | null;
  metadata?: Prisma.InputJsonValue;
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
  if (existing) {
    walletLog("grant.duplicate", { customerId: params.customerId, key: params.idempotencyKey, reason: params.reason });
    return { ok: true, duplicate: true };
  }

  const resets = params.resetsExpiration ?? false;
  try {
    await tx.ghostCreditTransaction.create({
      data: {
        customerId: params.customerId,
        amountMad: params.amountMad,
        direction: "credit",
        reason: params.reason,
        resetsExpiration: resets,
        promoCodeId: params.promoCodeId ?? null,
        orderId: params.orderId ?? null,
        rewardType: params.rewardType ?? null,
        eligibleSubtotalMad: params.eligibleSubtotalMad ?? null,
        configuredPercent: params.configuredPercent ?? null,
        configuredFixedMad: params.configuredFixedMad ?? null,
        milestoneId: params.milestoneId ?? null,
        thresholdMad: params.thresholdMad ?? null,
        qualifyingSpendMad: params.qualifyingSpendMad ?? null,
        relatedTransactionId: params.relatedTransactionId ?? null,
        metadata: params.metadata ?? undefined,
        status: "active",
        idempotencyKey: params.idempotencyKey,
        expiresAt: params.expiresAt ?? null,
        source: params.source ?? "system",
        note: params.note ?? null,
      },
    });
  } catch (error) {
    // Two concurrent grants with the same key raced past the findUnique check;
    // the unique constraint is the real guard, so treat the loser as a no-op.
    if (isUniqueViolation(error)) {
      walletLog("grant.duplicate.race", { customerId: params.customerId, key: params.idempotencyKey });
      return { ok: true, duplicate: true };
    }
    throw error;
  }

  // Expiry timer: ONLY a qualifying reward resets it. A non-qualifying grant
  // (manual/refund/…) preserves the current cycle; if none exists it seeds a
  // default expiry so the credit isn't permanent, WITHOUT marking it qualifying.
  const now = params.earnedAt ?? new Date();
  const inactivityDays = params.inactivityDays ?? GHOST_CREDIT_DEFAULT_INACTIVITY_DAYS;
  const current = resets
    ? null
    : await tx.customer.findUnique({
        where: { id: params.customerId },
        select: { ghostCreditExpiresAt: true },
      });
  const decision = computeExpiryDecision({
    resetsExpiration: resets,
    currentExpiresAt: current?.ghostCreditExpiresAt ?? null,
    now,
    inactivityDays,
  });
  const expiryData: Prisma.CustomerUpdateInput = {
    ...(decision.markQualifying ? { lastQualifyingCreditEarnedAt: now } : {}),
    ...(decision.changeExpiry ? { ghostCreditExpiresAt: decision.newExpiresAt } : {}),
  };

  const customer = await tx.customer.update({
    where: { id: params.customerId },
    data: { ghostCreditBalanceMad: { increment: params.amountMad }, ...expiryData },
    select: { ghostCreditBalanceMad: true },
  });
  walletLog("grant.settled", {
    customerId: params.customerId,
    amountMad: params.amountMad,
    reason: params.reason,
    resets,
    key: params.idempotencyKey,
    balanceMad: customer.ghostCreditBalanceMad,
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
  if (existing) {
    walletLog("debit.duplicate", { customerId: params.customerId, key: params.idempotencyKey, reason: params.reason });
    return { ok: true, duplicate: true };
  }

  // CRITICAL: lock the wallet row before reading the balance, so the balance
  // used to cap the debit reflects committed state and no concurrent debit can
  // interleave between the read and the decrement. Without this, two concurrent
  // debits (e.g. a checkout spend racing an admin reversal, or a spend racing
  // expiry) could both read the full balance and both decrement, overspending
  // into a negative balance.
  await lockWallet(tx, params.customerId);
  const customer = await tx.customer.findUnique({
    where: { id: params.customerId },
    select: { ghostCreditBalanceMad: true },
  });
  const balance = customer?.ghostCreditBalanceMad ?? 0;
  const allowNegative = params.allowNegative ?? false;
  const { appliedMad: applied, wouldGoNegative } = capDebit(params.amountMad, balance, allowNegative);

  if (applied <= 0) {
    if (wouldGoNegative) {
      walletLog("debit.insufficient", {
        customerId: params.customerId,
        requestedMad: params.amountMad,
        balanceMad: balance,
        reason: params.reason,
      });
    }
    return { ok: true, duplicate: false, wouldGoNegative, appliedMad: 0 };
  }

  try {
    await tx.ghostCreditTransaction.create({
      data: {
        customerId: params.customerId,
        amountMad: applied,
        direction: "debit",
        reason: params.reason,
        // Debits (spend/reversal/expiry) NEVER reset the inactivity timer.
        resetsExpiration: false,
        promoCodeId: params.promoCodeId ?? null,
        orderId: params.orderId ?? null,
        rewardType: params.rewardType ?? null,
        milestoneId: params.milestoneId ?? null,
        thresholdMad: params.thresholdMad ?? null,
        relatedTransactionId: params.relatedTransactionId ?? null,
        metadata: params.metadata ?? undefined,
        status: "active",
        idempotencyKey: params.idempotencyKey,
        source: params.source ?? "system",
        note: params.note ?? null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      walletLog("debit.duplicate.race", { customerId: params.customerId, key: params.idempotencyKey });
      return { ok: true, duplicate: true };
    }
    throw error;
  }
  // Spending never extends the deadline. Clear it once the wallet empties so an
  // empty wallet doesn't carry a stale expiry date.
  const remaining = balance - applied;
  await tx.customer.update({
    where: { id: params.customerId },
    data: {
      ghostCreditBalanceMad: { decrement: applied },
      ...(remaining <= 0 ? { ghostCreditExpiresAt: null } : {}),
    },
  });
  walletLog("debit.settled", {
    customerId: params.customerId,
    amountMad: applied,
    reason: params.reason,
    key: params.idempotencyKey,
    balanceMad: remaining,
    wouldGoNegative,
  });
  return { ok: true, duplicate: false, wouldGoNegative, appliedMad: applied };
}

/**
 * Expire the whole wallet if its 60-day inactivity deadline has passed: debit
 * the full remaining balance (reason "expiration"), mark the still-active credit
 * rows expired, and clear the deadline. Idempotent per (customer, deadline).
 * Runs in the given transaction. Returns the balance after any expiry.
 */
export async function expireWalletIfDue(tx: Tx, customerId: string, now = new Date()): Promise<number> {
  // Lock the wallet before the read-then-zero so expiry can't race a concurrent
  // spend/grant into a negative or resurrected balance.
  await lockWallet(tx, customerId);
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { ghostCreditBalanceMad: true, ghostCreditExpiresAt: true },
  });
  if (!customer) return 0;
  const balance = customer.ghostCreditBalanceMad;
  const deadline = customer.ghostCreditExpiresAt;
  if (!deadline || now.getTime() <= deadline.getTime() || balance <= 0) return balance;

  const key = walletExpireKey(customerId, deadline.toISOString());
  const existing = await tx.ghostCreditTransaction.findUnique({
    where: { idempotencyKey: key },
    select: { id: true },
  });
  if (existing) return balance;

  await tx.ghostCreditTransaction.create({
    data: {
      customerId,
      amountMad: balance,
      direction: "debit",
      reason: "expiration",
      status: "active",
      idempotencyKey: key,
      source: "system",
      note: `Crédit Ghost expiré après inactivité`,
    },
  });
  // Mark the credits that made up this balance as expired (audit clarity).
  await tx.ghostCreditTransaction.updateMany({
    where: { customerId, direction: "credit", status: "active" },
    data: { status: "expired" },
  });
  await tx.customer.update({
    where: { id: customerId },
    data: { ghostCreditBalanceMad: 0, ghostCreditExpiresAt: null },
  });
  walletLog("expire.settled", { customerId, amountMad: balance, key });
  return 0;
}

/**
 * Current spendable balance after applying any due expiry. Used at checkout so a
 * customer can never spend already-expired credit.
 */
export async function getSpendableBalance(
  customerId: string,
): Promise<{ balanceMad: number; expiresAt: string | null; frozen: boolean }> {
  await ensureDatabaseReady();
  const rawBalance = await prisma.$transaction((tx) => expireWalletIfDue(tx, customerId));
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { ghostCreditExpiresAt: true, walletFrozen: true },
  });
  const frozen = customer?.walletFrozen ?? false;
  // A frozen wallet is not spendable — report 0 spendable so no checkout can
  // apply it, while the account page still shows the real (frozen) balance.
  return {
    balanceMad: frozen ? 0 : rawBalance,
    expiresAt: iso(customer?.ghostCreditExpiresAt ?? null),
    frozen,
  };
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
  // Apply any due expiry first so the page never shows a stale balance.
  await prisma.$transaction((tx) => expireWalletIfDue(tx, customerId));
  const [customer, rows] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { ghostCreditBalanceMad: true, ghostCreditExpiresAt: true, walletFrozen: true },
    }),
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
    expiresAt: iso(customer?.ghostCreditExpiresAt ?? null),
    frozen: customer?.walletFrozen ?? false,
    transactions: rows.map(buildTransactionDTO),
  };
}
