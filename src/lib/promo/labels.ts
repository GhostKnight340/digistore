/**
 * French display labels and value formatting for promo codes. Mirrors the
 * conventions in src/lib/orderStatus.ts (label maps + badge class helpers).
 * Customer-facing money uses "DH"; internal currency stays MAD.
 */
import type { PromoRewardType, PromoCodeStatus } from "@/lib/types";

export const PROMO_REWARD_TYPE_LABELS: Record<PromoRewardType, string> = {
  PERCENT_DISCOUNT: "Réduction en pourcentage",
  FIXED_DISCOUNT: "Réduction fixe",
  FIXED_GHOST_CREDIT: "Crédit Ghost fixe",
  PERCENT_GHOST_CREDIT: "Crédit Ghost en pourcentage",
};

export const PROMO_STATUS_LABELS: Record<PromoCodeStatus, string> = {
  active: "Actif",
  scheduled: "Programmé",
  expired: "Expiré",
  exhausted: "Épuisé",
  archived: "Archivé",
  disabled: "Désactivé",
};

export function promoRewardTypeLabel(rewardType: string): string {
  return PROMO_REWARD_TYPE_LABELS[rewardType as PromoRewardType] ?? rewardType;
}

export function promoStatusLabel(status: string): string {
  return PROMO_STATUS_LABELS[status as PromoCodeStatus] ?? status;
}

/**
 * Compact reward "value" display used in the admin list, e.g.
 *   "10 %", "20 DH", "25 DH Crédit Ghost", "10 % Crédit Ghost, max 50 DH".
 */
export function promoValueLabel(input: {
  rewardType: string;
  percentValue?: number | null;
  fixedAmountMad?: number | null;
  maxDiscountMad?: number | null;
  maxCreditMad?: number | null;
}): string {
  const pct = input.percentValue ?? 0;
  const fixed = input.fixedAmountMad ?? 0;
  switch (input.rewardType) {
    case "PERCENT_DISCOUNT":
      return input.maxDiscountMad != null ? `${pct} %, max ${input.maxDiscountMad} DH` : `${pct} %`;
    case "FIXED_DISCOUNT":
      return `${fixed} DH`;
    case "FIXED_GHOST_CREDIT":
      return `${fixed} DH Crédit Ghost`;
    case "PERCENT_GHOST_CREDIT":
      return input.maxCreditMad != null
        ? `${pct} % Crédit Ghost, max ${input.maxCreditMad} DH`
        : `${pct} % Crédit Ghost`;
    default:
      return "—";
  }
}

/** Tailwind classes for a promo status pill (status is never color-only —
 *  callers render the text label alongside). Mirrors CollectionsPanel tones. */
export function promoStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "scheduled":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    case "expired":
    case "exhausted":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "archived":
      return "border-white/15 bg-white/5 text-muted";
    case "disabled":
    default:
      return "border-red-500/40 bg-red-500/10 text-red-300";
  }
}
