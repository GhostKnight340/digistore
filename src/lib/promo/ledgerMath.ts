/**
 * Pure Ghost Credit ledger math + canonical idempotency-key builders.
 *
 * No I/O, no Prisma — so the accounting rules that protect the wallet (debit
 * capping, balance derivation, spend capping, negative/zero rejection) and the
 * exact idempotency keys used in production are unit-testable in isolation
 * (see test/promo/wallet.test.ts). The DB layer imports these so the tested
 * logic is the same logic that runs live.
 *
 * Money is whole MAD integers everywhere (no floats).
 */

export interface LedgerRow {
  direction: "credit" | "debit";
  amountMad: number;
  status: string;
}

/**
 * Balance derived from the append-only ledger: active credits add, active
 * debits subtract. Reversed/expired rows (and their offsetting debits) are
 * excluded, so they never double-count. This is the source of truth the cached
 * balance is reconciled against.
 */
export function deriveBalance(rows: LedgerRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.status !== "active") continue;
    total += row.direction === "credit" ? row.amountMad : -row.amountMad;
  }
  return total;
}

/**
 * Cap a debit to the current balance (never negative) unless negatives are
 * explicitly allowed. `wouldGoNegative` tells the caller the request exceeded
 * the balance so it can flag/freeze rather than silently swallow the shortfall.
 */
export function capDebit(
  requestedMad: number,
  balanceMad: number,
  allowNegative: boolean,
): { appliedMad: number; wouldGoNegative: boolean } {
  if (requestedMad <= 0) return { appliedMad: 0, wouldGoNegative: false };
  const wouldGoNegative = requestedMad > balanceMad;
  const appliedMad = allowNegative ? requestedMad : Math.min(requestedMad, Math.max(0, balanceMad));
  return { appliedMad, wouldGoNegative };
}

/**
 * Ghost Credit a customer may spend on an order: never more than the (server-
 * read) balance, never more than what's left to pay, never negative. A
 * client-submitted amount is only ever an upper bound requested — this is the
 * authority.
 */
export function capSpend(requestedMad: number, balanceMad: number, remainingPayableMad: number): number {
  const req = Math.floor(Number.isFinite(requestedMad) ? requestedMad : 0);
  if (req <= 0) return 0;
  return Math.max(0, Math.min(req, Math.max(0, balanceMad), Math.max(0, remainingPayableMad)));
}

// ── Expiry timer decision (only qualifying rewards reset it) ─────────────────

export interface ExpiryDecision {
  /** Set Customer.lastQualifyingCreditEarnedAt to `now` (qualifying reward only). */
  markQualifying: boolean;
  /** Whether to write a new ghostCreditExpiresAt at all. */
  changeExpiry: boolean;
  /** The new deadline to write when changeExpiry is true. */
  newExpiresAt: Date | null;
}

/**
 * Decide how a Ghost Credit grant affects the wallet's inactivity timer.
 *
 *  - Qualifying reward (promo/milestone from a paid+completed order): reset —
 *    mark qualifying and set the deadline to now + inactivityDays.
 *  - Non-qualifying grant (manual/refund/…) with an existing cycle: preserve it
 *    (no change), and never mark qualifying.
 *  - Non-qualifying grant into a wallet with NO cycle: seed a default deadline
 *    (now + inactivityDays) so the credit isn't permanent, but do NOT mark it
 *    qualifying (it won't count as an earning event).
 */
export function computeExpiryDecision(params: {
  resetsExpiration: boolean;
  currentExpiresAt: Date | string | null;
  now: Date;
  inactivityDays: number;
}): ExpiryDecision {
  const deadline = new Date(params.now.getTime() + params.inactivityDays * 24 * 60 * 60 * 1000);
  if (params.resetsExpiration) {
    return { markQualifying: true, changeExpiry: true, newExpiresAt: deadline };
  }
  if (!params.currentExpiresAt) {
    return { markQualifying: false, changeExpiry: true, newExpiresAt: deadline };
  }
  return { markQualifying: false, changeExpiry: false, newExpiresAt: null };
}

// ── Canonical idempotency keys (one per credit-affecting event) ──────────────

/** Promo Ghost Credit reward for an order. */
export function promoCreditKey(orderId: string, promoRef: string): string {
  return `promo-credit:${orderId}:${promoRef}`;
}
/** Reversal of a promo reward on refund (seq allows multiple partial reversals). */
export function promoReversalKey(orderId: string, promoRef: string, seq = 1): string {
  return `promo-reversal:${orderId}:${promoRef}:${seq}`;
}
/** Credit spent on an order (one per order). */
export function orderSpendKey(orderId: string): string {
  return `credit-spend:${orderId}`;
}
/** Restitution of spent credit when an order doesn't complete (one per order). */
export function orderRefundKey(orderId: string): string {
  return `credit-refund:${orderId}`;
}
/** Manual admin adjustment (one per admin UI request). */
export function manualCreditKey(requestId: string): string {
  return `manual-credit:${requestId}`;
}
/** Whole-wallet expiry for a specific deadline (one per deadline). */
export function walletExpireKey(customerId: string, deadlineIso: string): string {
  return `wallet-expire:${customerId}:${deadlineIso}`;
}
/** Spending-milestone reward (one per milestone per customer, ever). */
export function milestoneGrantKey(milestoneId: string, customerId: string): string {
  return `spending-milestone:${milestoneId}:${customerId}`;
}
/** Spending-milestone reversal after a refund drops qualifying spend. */
export function milestoneReversalKey(milestoneId: string, customerId: string): string {
  return `spending-milestone-reversal:${milestoneId}:${customerId}`;
}
/** Expiry reminder email (one per expiration cycle). */
export function expiryReminderKey(customerId: string, deadlineIso: string): string {
  return `ghost-credit-expiry-reminder:${customerId}:${deadlineIso}`;
}
