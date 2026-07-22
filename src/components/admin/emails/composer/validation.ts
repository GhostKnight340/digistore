/**
 * Live composer validation — pure, recomputed on every edit (not only at send).
 * Drives the sticky action bar indicator and its checklist popover. The server
 * re-validates everything at send time; this is UX only.
 */

import { isSafeUrl } from "@/lib/email/composerModules";
import type { ComposerState } from "../types";

export type ValidationStatus = "ready" | "review" | "blocked";

export type ValidationIssue = {
  id: string;
  label: string;
  /** blocking issues make the send impossible; non-blocking are "à vérifier". */
  blocking: boolean;
};

export type ValidationResult = {
  status: ValidationStatus;
  issues: ValidationIssue[];
  blockingCount: number;
  reviewCount: number;
};

/** Recipients with no linked Ghost.ma account (can never receive real credit). */
function accountlessCount(state: ComposerState): number {
  return state.recipients.filter((r) => !r.customerId).length;
}

export function computeValidation(state: ComposerState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.recipients.length === 0) {
    issues.push({ id: "no-recipients", label: "Aucun destinataire sélectionné", blocking: true });
  }
  if (!state.templateKey) {
    issues.push({ id: "no-template", label: "Aucun modèle sélectionné", blocking: true });
  }
  if (!state.subject.trim()) {
    issues.push({ id: "no-subject", label: "Objet manquant", blocking: true });
  }
  if (state.modules.length === 0) {
    issues.push({ id: "no-content", label: "Aucun contenu ajouté", blocking: true });
  }

  // Per-module completeness.
  state.modules.forEach((m, i) => {
    const n = i + 1;
    if (m.type === "product" && !m.productId) {
      issues.push({ id: `product-${m.id}`, label: `Module ${n} : produit non sélectionné`, blocking: true });
    }
    if (m.type === "order" && !m.orderId) {
      issues.push({ id: `order-${m.id}`, label: `Module ${n} : commande non sélectionnée`, blocking: true });
    }
    if (m.type === "button" && !isSafeUrl(m.url)) {
      issues.push({ id: `button-${m.id}`, label: `Module ${n} : URL de bouton invalide`, blocking: true });
    }
    if (m.type === "payment" && !m.methodId) {
      issues.push({ id: `payment-${m.id}`, label: `Module ${n} : mode de paiement non choisi`, blocking: true });
    }
    if (m.type === "coupon" && !m.promoCodeId) {
      issues.push({ id: `coupon-${m.id}`, label: `Module ${n} : code promo non choisi`, blocking: true });
    }
  });

  // Real-credit + accountless recipients → non-blocking warning.
  const realCredit = state.modules.some((m) => m.type === "credit" && m.behavior === "grant");
  if (realCredit) {
    const noAccount = accountlessCount(state);
    if (noAccount > 0) {
      issues.push({
        id: "credit-no-account",
        label: `${noAccount} destinataire(s) sans compte ne recevront pas de crédit réel`,
        blocking: false,
      });
    }
  }

  const blockingCount = issues.filter((i) => i.blocking).length;
  const reviewCount = issues.length - blockingCount;
  const status: ValidationStatus = blockingCount > 0 ? "blocked" : reviewCount > 0 ? "review" : "ready";
  return { status, issues, blockingCount, reviewCount };
}

export const STATUS_LABEL: Record<ValidationStatus, string> = {
  ready: "Prêt à envoyer",
  review: "À vérifier",
  blocked: "Impossible d'envoyer",
};
