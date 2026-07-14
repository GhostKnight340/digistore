/**
 * Promo-code engine — PURE, dependency-free logic.
 *
 * No Prisma, no server-only, no I/O. Every function here is deterministic so the
 * whole promo/Ghost-Credit money model is unit-testable in isolation (see
 * test/promo/engine.test.ts) and reusable identically on the server (order
 * creation, checkout validation) and, where safe, for display previews.
 *
 * Money is whole MAD (integer dirhams), matching Order.totalMad. Percentages are
 * plain numbers (e.g. 10 = 10%, 8.5 = 8.5%). Rounding is Math.round to the
 * nearest dirham — the project stores no centimes.
 */

import type { PromoRewardType, PromoRewardKind, PromoCodeStatus } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const PROMO_REWARD_TYPES: readonly PromoRewardType[] = [
  "PERCENT_DISCOUNT",
  "FIXED_DISCOUNT",
  "FIXED_GHOST_CREDIT",
  "PERCENT_GHOST_CREDIT",
] as const;

/** Reward types that grant Ghost Credit (as opposed to an immediate discount). */
export function rewardKind(rewardType: PromoRewardType): PromoRewardKind {
  return rewardType === "FIXED_GHOST_CREDIT" || rewardType === "PERCENT_GHOST_CREDIT"
    ? "credit"
    : "discount";
}

export function isGhostCreditReward(rewardType: PromoRewardType): boolean {
  return rewardKind(rewardType) === "credit";
}

// ── Normalization & rounding ─────────────────────────────────────────────────

/** Trim, collapse internal whitespace, and uppercase a raw code input. */
export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, "").trim().toUpperCase();
}

/** Round a MAD amount to the nearest whole dirham (project money-rounding rule). */
export function roundMad(amount: number): number {
  return Math.round(amount);
}

// ── Configuration validation ─────────────────────────────────────────────────

export interface PromoConfigInput {
  code: string;
  internalName: string;
  rewardType: PromoRewardType;
  percentValue?: number | null;
  fixedAmountMad?: number | null;
  maxDiscountMad?: number | null;
  maxCreditMad?: number | null;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  maxTotalUses?: number | null;
  maxUsesPerCustomer?: number | null;
  minSubtotalMad?: number | null;
  maxSubtotalMad?: number | null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validate an admin promo-code configuration. Returns the FIRST failing rule
 * with a clear French message, matching the project's inline-validation style.
 */
export function validatePromoConfig(input: PromoConfigInput): ValidationResult {
  const code = normalizePromoCode(input.code ?? "");
  if (!code) return { ok: false, error: "Le code est requis." };
  if (!/^[A-Z0-9._-]+$/.test(code)) {
    return { ok: false, error: "Le code ne peut contenir que des lettres, chiffres, points, tirets." };
  }
  if (!input.internalName?.trim()) {
    return { ok: false, error: "Le nom interne est requis." };
  }
  if (!PROMO_REWARD_TYPES.includes(input.rewardType)) {
    return { ok: false, error: "Type de récompense invalide." };
  }

  const pct = input.percentValue ?? null;
  const fixed = input.fixedAmountMad ?? null;

  switch (input.rewardType) {
    case "PERCENT_DISCOUNT":
      if (pct == null || pct <= 0) return { ok: false, error: "Le pourcentage de réduction doit être supérieur à 0." };
      if (pct > 100) return { ok: false, error: "Le pourcentage de réduction ne peut pas dépasser 100." };
      if (input.maxDiscountMad != null && input.maxDiscountMad <= 0) {
        return { ok: false, error: "La réduction maximale doit être supérieure à 0." };
      }
      break;
    case "FIXED_DISCOUNT":
      if (fixed == null || fixed <= 0) return { ok: false, error: "Le montant de la réduction doit être supérieur à 0." };
      break;
    case "FIXED_GHOST_CREDIT":
      if (fixed == null || fixed <= 0) return { ok: false, error: "Le montant du crédit Ghost doit être supérieur à 0." };
      break;
    case "PERCENT_GHOST_CREDIT":
      if (pct == null || pct <= 0) return { ok: false, error: "Le pourcentage de crédit Ghost doit être supérieur à 0." };
      if (pct > 100) return { ok: false, error: "Le pourcentage de crédit Ghost ne peut pas dépasser 100." };
      if (input.maxCreditMad != null && input.maxCreditMad <= 0) {
        return { ok: false, error: "Le crédit Ghost maximal doit être supérieur à 0." };
      }
      break;
  }

  const start = toDate(input.startAt);
  const end = toDate(input.endAt);
  if (start && end && end.getTime() <= start.getTime()) {
    return { ok: false, error: "La date de fin doit être postérieure à la date de début." };
  }

  if (input.maxTotalUses != null && input.maxTotalUses <= 0) {
    return { ok: false, error: "La limite d'utilisations totale doit être supérieure à 0." };
  }
  if (input.maxUsesPerCustomer != null && input.maxUsesPerCustomer <= 0) {
    return { ok: false, error: "La limite par client doit être supérieure à 0." };
  }
  if (
    input.maxTotalUses != null &&
    input.maxUsesPerCustomer != null &&
    input.maxUsesPerCustomer > input.maxTotalUses
  ) {
    return { ok: false, error: "La limite par client ne peut pas dépasser la limite totale." };
  }
  if (input.minSubtotalMad != null && input.minSubtotalMad < 0) {
    return { ok: false, error: "Le sous-total minimum ne peut pas être négatif." };
  }
  if (input.maxSubtotalMad != null && input.maxSubtotalMad <= 0) {
    return { ok: false, error: "Le sous-total maximum doit être supérieur à 0." };
  }
  if (
    input.minSubtotalMad != null &&
    input.maxSubtotalMad != null &&
    input.maxSubtotalMad < input.minSubtotalMad
  ) {
    return { ok: false, error: "Le sous-total maximum ne peut pas être inférieur au minimum." };
  }

  return { ok: true };
}

// ── Eligibility (product/category restrictions + OR matching) ────────────────

export interface EligibilityLine {
  /** Stable id for this cart/order line (orderItemId at order time, cart key before). */
  lineId: string;
  /** Parent product id used to match selected products. */
  productId: string;
  /** Category id used to match selected categories. */
  categoryId: string | null;
  unitPriceMad: number;
  quantity: number;
}

export interface Restrictions {
  productIds: string[];
  categoryIds: string[];
}

export interface EligibilityResult {
  /** lineIds that matched the restriction (all lines when unrestricted). */
  eligibleLineIds: string[];
  eligibleSubtotalMad: number;
}

/**
 * Resolve which lines a promo applies to and their combined subtotal.
 *
 * Rules (see docs/promo-codes.md):
 *  - No products AND no categories selected → applies to ALL lines.
 *  - Otherwise a line is eligible when it matches an explicitly selected product
 *    OR one of the selected categories (OR semantics, never AND).
 */
export function computeEligibility(lines: EligibilityLine[], restrictions: Restrictions): EligibilityResult {
  const productSet = new Set(restrictions.productIds);
  const categorySet = new Set(restrictions.categoryIds);
  const unrestricted = productSet.size === 0 && categorySet.size === 0;

  const eligibleLineIds: string[] = [];
  let eligibleSubtotalMad = 0;
  for (const line of lines) {
    const matches =
      unrestricted ||
      productSet.has(line.productId) ||
      (line.categoryId != null && categorySet.has(line.categoryId));
    if (matches) {
      eligibleLineIds.push(line.lineId);
      eligibleSubtotalMad += line.unitPriceMad * line.quantity;
    }
  }
  return { eligibleLineIds, eligibleSubtotalMad };
}

// ── Reward amount computation ────────────────────────────────────────────────

export interface RewardConfig {
  rewardType: PromoRewardType;
  percentValue?: number | null;
  fixedAmountMad?: number | null;
  maxDiscountMad?: number | null;
  maxCreditMad?: number | null;
}

/**
 * Immediate discount amount (whole MAD) for a discount-type code. Always
 * clamped to [0, eligibleSubtotal] so it can never make a line/order negative.
 * Returns 0 for Ghost Credit reward types.
 */
export function computeDiscount(config: RewardConfig, eligibleSubtotalMad: number): number {
  if (eligibleSubtotalMad <= 0) return 0;
  let discount = 0;
  if (config.rewardType === "PERCENT_DISCOUNT") {
    discount = roundMad((eligibleSubtotalMad * (config.percentValue ?? 0)) / 100);
    if (config.maxDiscountMad != null) discount = Math.min(discount, config.maxDiscountMad);
  } else if (config.rewardType === "FIXED_DISCOUNT") {
    discount = roundMad(config.fixedAmountMad ?? 0);
  } else {
    return 0;
  }
  return Math.max(0, Math.min(discount, eligibleSubtotalMad));
}

/**
 * Ghost Credit amount (whole MAD) for a credit-type code, computed from the
 * ELIGIBLE subtotal only (never the full cart), with the optional cap applied.
 * Returns 0 for discount reward types.
 */
export function computeGhostCredit(config: RewardConfig, eligibleSubtotalMad: number): number {
  if (eligibleSubtotalMad <= 0) return 0;
  let credit = 0;
  if (config.rewardType === "FIXED_GHOST_CREDIT") {
    credit = roundMad(config.fixedAmountMad ?? 0);
  } else if (config.rewardType === "PERCENT_GHOST_CREDIT") {
    credit = roundMad((eligibleSubtotalMad * (config.percentValue ?? 0)) / 100);
    if (config.maxCreditMad != null) credit = Math.min(credit, config.maxCreditMad);
  } else {
    return 0;
  }
  return Math.max(0, credit);
}

// ── Deterministic per-line discount allocation ───────────────────────────────

export interface LineAllocation {
  lineId: string;
  discountMad: number;
}

/**
 * Distribute a total discount across eligible lines proportionally to each
 * line's subtotal, in whole MAD, summing EXACTLY to the total discount.
 *
 * Uses the largest-remainder method for determinism: floor each proportional
 * share, then hand the leftover dirhams (from rounding) to the lines with the
 * largest fractional remainders, breaking ties by input order. This persisted
 * allocation is what refunds are computed against, so it must be stable.
 */
export function allocateDiscount(totalDiscountMad: number, lines: EligibilityLine[]): LineAllocation[] {
  const eligible = lines.filter((l) => l.unitPriceMad * l.quantity > 0);
  if (totalDiscountMad <= 0 || eligible.length === 0) {
    return lines.map((l) => ({ lineId: l.lineId, discountMad: 0 }));
  }
  const subtotals = eligible.map((l) => l.unitPriceMad * l.quantity);
  const eligibleSubtotal = subtotals.reduce((a, b) => a + b, 0);
  const capped = Math.min(totalDiscountMad, eligibleSubtotal);

  const raw = subtotals.map((s) => (capped * s) / eligibleSubtotal);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = capped - floored.reduce((a, b) => a + b, 0);

  // Order indices by descending fractional part, then ascending original index.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  const allocByIndex = floored.slice();
  for (let k = 0; k < order.length && remainder > 0; k++) {
    // Never allocate more than a line's own subtotal.
    if (allocByIndex[order[k].i] < subtotals[order[k].i]) {
      allocByIndex[order[k].i] += 1;
      remainder -= 1;
    }
  }

  const byLine = new Map<string, number>();
  eligible.forEach((l, idx) => byLine.set(l.lineId, allocByIndex[idx]));
  return lines.map((l) => ({ lineId: l.lineId, discountMad: byLine.get(l.lineId) ?? 0 }));
}

// ── Lifecycle status ─────────────────────────────────────────────────────────

export interface StatusInput {
  active: boolean;
  archivedAt: Date | string | null;
  startAt: Date | string | null;
  endAt: Date | string | null;
  maxTotalUses: number | null;
  reservedUses: number;
}

/**
 * Derived lifecycle status. Precedence: archived → disabled → scheduled →
 * expired → exhausted → active. (An archived code reads "archived" even if also
 * disabled/expired — archival is the strongest state.)
 */
export function evaluatePromoStatus(input: StatusInput, now: Date): PromoCodeStatus {
  if (input.archivedAt) return "archived";
  if (!input.active) return "disabled";
  const start = toDate(input.startAt);
  const end = toDate(input.endAt);
  if (start && now.getTime() < start.getTime()) return "scheduled";
  if (end && now.getTime() > end.getTime()) return "expired";
  if (input.maxTotalUses != null && input.reservedUses >= input.maxTotalUses) return "exhausted";
  return "active";
}

// ── Redeemability at checkout ────────────────────────────────────────────────

export interface RedeemContext {
  now: Date;
  isLoggedIn: boolean;
  isFirstOrder: boolean;
  /** Prior finalized+reserved redemptions by this customer for this code. */
  customerUses: number;
  eligibleSubtotalMad: number;
}

export interface RedeemablePromo {
  rewardType: PromoRewardType;
  active: boolean;
  archivedAt: Date | string | null;
  startAt: Date | string | null;
  endAt: Date | string | null;
  maxTotalUses: number | null;
  reservedUses: number;
  maxUsesPerCustomer: number | null;
  firstOrderOnly: boolean;
  loggedInOnly: boolean;
  minSubtotalMad: number | null;
  maxSubtotalMad: number | null;
}

/**
 * Server-authoritative check that a resolved promo can be applied to a specific
 * cart/customer right now. Returns a French error on the first failing rule.
 * Ghost Credit reward types implicitly require login (credit must attach to a
 * real account), independent of the loggedInOnly toggle.
 */
export function validateRedeemability(promo: RedeemablePromo, ctx: RedeemContext): ValidationResult {
  const status = evaluatePromoStatus(promo, ctx.now);
  if (status === "archived" || status === "disabled") {
    return { ok: false, error: "Ce code promo n'est plus actif." };
  }
  if (status === "scheduled") return { ok: false, error: "Ce code promo n'est pas encore actif." };
  if (status === "expired") return { ok: false, error: "Ce code promo a expiré." };
  if (status === "exhausted") return { ok: false, error: "Ce code promo a atteint sa limite d'utilisation." };

  const requiresLogin = promo.loggedInOnly || isGhostCreditReward(promo.rewardType);
  if (requiresLogin && !ctx.isLoggedIn) {
    return isGhostCreditReward(promo.rewardType)
      ? { ok: false, error: "Connectez-vous ou créez un compte pour recevoir ce crédit Ghost." }
      : { ok: false, error: "Ce code promo nécessite un compte. Connectez-vous pour l'utiliser." };
  }

  if (promo.firstOrderOnly && !ctx.isFirstOrder) {
    return { ok: false, error: "Ce code promo est réservé à une première commande." };
  }
  if (promo.maxUsesPerCustomer != null && ctx.customerUses >= promo.maxUsesPerCustomer) {
    return { ok: false, error: "Vous avez déjà utilisé ce code le nombre de fois autorisé." };
  }

  if (ctx.eligibleSubtotalMad <= 0) {
    return { ok: false, error: "Aucun produit éligible dans votre panier pour ce code." };
  }
  if (promo.minSubtotalMad != null && ctx.eligibleSubtotalMad < promo.minSubtotalMad) {
    return {
      ok: false,
      error: `Le sous-total éligible doit être d'au moins ${promo.minSubtotalMad} DH pour ce code.`,
    };
  }
  if (promo.maxSubtotalMad != null && ctx.eligibleSubtotalMad > promo.maxSubtotalMad) {
    return {
      ok: false,
      error: `Le sous-total éligible dépasse le maximum de ${promo.maxSubtotalMad} DH pour ce code.`,
    };
  }

  return { ok: true };
}

// ── Refund / reversal math ───────────────────────────────────────────────────

/**
 * Ghost Credit to reverse when eligible items are refunded.
 *
 *  - PERCENT_GHOST_CREDIT: reverse the same percentage of the refunded eligible
 *    amount (proportional), capped so total reversal never exceeds the grant.
 *  - FIXED_GHOST_CREDIT: full reversal if ALL eligible items are refunded,
 *    otherwise a proportional reversal based on the refunded fraction of the
 *    eligible subtotal.
 *
 * Returns the whole-MAD amount to debit (0..grantedCreditMad).
 */
export function computeCreditReversal(params: {
  rewardType: PromoRewardType;
  grantedCreditMad: number;
  eligibleSubtotalMad: number;
  refundedEligibleMad: number;
  percentValue?: number | null;
}): number {
  const { grantedCreditMad, eligibleSubtotalMad, refundedEligibleMad } = params;
  if (grantedCreditMad <= 0 || refundedEligibleMad <= 0 || eligibleSubtotalMad <= 0) return 0;
  const refundedFraction = Math.min(1, refundedEligibleMad / eligibleSubtotalMad);

  let reversal: number;
  if (params.rewardType === "PERCENT_GHOST_CREDIT") {
    // Proportional to refunded eligible amount (== same percentage of it).
    reversal = roundMad(grantedCreditMad * refundedFraction);
  } else {
    // FIXED_GHOST_CREDIT: full if everything eligible refunded, else prorated.
    reversal = refundedFraction >= 1 ? grantedCreditMad : roundMad(grantedCreditMad * refundedFraction);
  }
  return Math.max(0, Math.min(reversal, grantedCreditMad));
}

/**
 * Refund amount actually owed for a refunded line: its list price minus the
 * promo discount that was allocated to it. Never refunds the undiscounted price.
 */
export function refundableLineAmount(lineListPriceMad: number, allocatedDiscountMad: number): number {
  return Math.max(0, lineListPriceMad - allocatedDiscountMad);
}

/** Stable idempotency key for a promo Ghost Credit grant. */
export function promoCreditIdempotencyKey(orderId: string, promoCodeId: string): string {
  return `promo-credit:${orderId}:${promoCodeId}`;
}

/** Stable idempotency key for a promo Ghost Credit reversal. */
export function promoReversalIdempotencyKey(orderId: string, promoCodeId: string, seq = 1): string {
  return `promo-reversal:${orderId}:${promoCodeId}:${seq}`;
}
