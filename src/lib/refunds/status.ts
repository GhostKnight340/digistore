import type {
  RefundReason,
  RefundResolutionType,
  RefundSource,
  RefundStatus,
} from "@/lib/types";

/**
 * Refund workflow — labels, French copy, and the LEGAL state machine.
 *
 * This module is pure (no server-only imports) so it can be shared by client
 * components (badges, filters) and the server (transition enforcement). The
 * server is the authority: every mutation calls `canTransition` before writing
 * a status, so a hidden/forged UI button can never drive an illegal transition.
 */

export const REFUND_STATUSES: RefundStatus[] = [
  "REQUESTED",
  "UNDER_REVIEW",
  "INFORMATION_REQUIRED",
  "CUSTOMER_RESPONDED",
  "APPROVED_AWAITING_CHOICE",
  "CHOICE_RECEIVED",
  "REFUND_PROCESSING",
  "REFUNDED",
  "CREDITED",
  "REPLACEMENT_PENDING",
  "REPLACED",
  "NOT_ELIGIBLE",
  "CANCELLED",
];

/** Customer-facing French label for each workflow status. */
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  REQUESTED: "Nouvelle demande",
  UNDER_REVIEW: "En cours d’examen",
  INFORMATION_REQUIRED: "Informations demandées",
  CUSTOMER_RESPONDED: "Réponse reçue",
  APPROVED_AWAITING_CHOICE: "En attente du choix client",
  CHOICE_RECEIVED: "Choix reçu",
  REFUND_PROCESSING: "Remboursement en cours",
  REFUNDED: "Remboursée",
  CREDITED: "Créditée",
  REPLACEMENT_PENDING: "Remplacement en cours",
  REPLACED: "Remplacée",
  NOT_ELIGIBLE: "Non éligible",
  CANCELLED: "Annulée",
};

export function refundStatusLabel(status: string): string {
  return REFUND_STATUS_LABELS[status as RefundStatus] ?? status;
}

/** Human-readable case number RF-000012 from the autoincrement seq. */
export function formatRefundNumber(seq: number): string {
  return `RF-${String(seq).padStart(6, "0")}`;
}

export function isRefundStatus(value: string): value is RefundStatus {
  return (REFUND_STATUSES as string[]).includes(value);
}

/** Chip Tailwind classes (mirrors orderStatusBadgeClass tones). */
export function refundStatusBadgeClass(status: string): string {
  switch (status as RefundStatus) {
    case "REFUNDED":
    case "CREDITED":
    case "REPLACED":
      return "border-green-500/40 text-green-400";
    case "APPROVED_AWAITING_CHOICE":
    case "CHOICE_RECEIVED":
    case "REFUND_PROCESSING":
    case "REPLACEMENT_PENDING":
      return "border-accent/40 text-accent";
    case "UNDER_REVIEW":
    case "CUSTOMER_RESPONDED":
      return "border-blue-500/40 text-blue-400";
    case "INFORMATION_REQUIRED":
      return "border-amber-500/40 text-amber-400";
    case "NOT_ELIGIBLE":
    case "CANCELLED":
      return "border-red-500/40 text-red-400";
    case "REQUESTED":
    default:
      return "border-purple-500/40 text-purple-400";
  }
}

/** The customer-selected reasons, with French labels. */
export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  code_invalid: "Code invalide",
  code_used: "Code déjà utilisé",
  wrong_product: "Mauvais produit reçu",
  not_delivered: "Produit non livré",
  duplicate_payment: "Paiement en double",
  order_error: "Erreur de commande",
  technical: "Problème technique",
  other: "Autre",
};

export const REFUND_REASONS = Object.keys(REFUND_REASON_LABELS) as RefundReason[];

export function refundReasonLabel(reason: string): string {
  return REFUND_REASON_LABELS[reason as RefundReason] ?? reason;
}

export function isRefundReason(value: string): value is RefundReason {
  return value in REFUND_REASON_LABELS;
}

/** Where the request came from (admin display). */
export const REFUND_SOURCE_LABELS: Record<RefundSource, string> = {
  CUSTOMER_ORDER_PAGE: "Page commande client",
  ADMIN_CREATED: "Créée par un admin",
  SUPPORT: "Support",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
};

export function refundSourceLabel(source: string): string {
  return REFUND_SOURCE_LABELS[source as RefundSource] ?? source;
}

export const REFUND_RESOLUTION_LABELS: Record<RefundResolutionType, string> = {
  ORIGINAL_PAYMENT_METHOD: "Moyen de paiement d’origine",
  GHOST_CREDIT: "Crédit Ghost",
  REPLACEMENT_PRODUCT: "Produit de remplacement",
};

export function refundResolutionLabel(type: string): string {
  return REFUND_RESOLUTION_LABELS[type as RefundResolutionType] ?? type;
}

/**
 * Positively-settled terminal states (money/replacement delivered). A case in
 * one of these represents a completed refund for the audit history.
 */
export const REFUND_SETTLED_STATUSES: RefundStatus[] = ["REFUNDED", "CREDITED", "REPLACED"];

/** Fully closed states — nothing further is expected without an explicit reopen. */
export const REFUND_TERMINAL_STATUSES: RefundStatus[] = [
  ...REFUND_SETTLED_STATUSES,
  "NOT_ELIGIBLE",
  "CANCELLED",
];

export function isRefundSettled(status: string): boolean {
  return (REFUND_SETTLED_STATUSES as string[]).includes(status);
}

export function isRefundTerminal(status: string): boolean {
  return (REFUND_TERMINAL_STATUSES as string[]).includes(status);
}

/**
 * A request is "active" (blocks a new duplicate request for the same order)
 * whenever it is not in a terminal state.
 */
export function isRefundActive(status: string): boolean {
  return !isRefundTerminal(status);
}

/**
 * LEGAL transitions. Enforced server-side in src/lib/db/refunds.ts. The
 * customer-driven transitions (CUSTOMER_RESPONDED via the info page,
 * CHOICE_RECEIVED via the resolution page) are included so those flows validate
 * against the same table; everything else is admin-driven.
 */
const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: [
    "UNDER_REVIEW",
    "INFORMATION_REQUIRED",
    "APPROVED_AWAITING_CHOICE",
    "NOT_ELIGIBLE",
    "CANCELLED",
  ],
  UNDER_REVIEW: [
    "INFORMATION_REQUIRED",
    "APPROVED_AWAITING_CHOICE",
    "NOT_ELIGIBLE",
    "CANCELLED",
  ],
  INFORMATION_REQUIRED: [
    "CUSTOMER_RESPONDED",
    "UNDER_REVIEW",
    "APPROVED_AWAITING_CHOICE",
    "NOT_ELIGIBLE",
    "CANCELLED",
  ],
  CUSTOMER_RESPONDED: [
    "UNDER_REVIEW",
    "INFORMATION_REQUIRED",
    "APPROVED_AWAITING_CHOICE",
    "NOT_ELIGIBLE",
    "CANCELLED",
  ],
  APPROVED_AWAITING_CHOICE: ["CHOICE_RECEIVED", "CANCELLED"],
  CHOICE_RECEIVED: [
    "REFUND_PROCESSING",
    "REFUNDED",
    "CREDITED",
    "REPLACEMENT_PENDING",
    "CANCELLED",
  ],
  REFUND_PROCESSING: ["REFUNDED", "CANCELLED"],
  REPLACEMENT_PENDING: ["REPLACED", "CANCELLED"],
  // Positively-settled terminals: no further transitions (close, don't move).
  REFUNDED: [],
  CREDITED: [],
  REPLACED: [],
  // Negatively-closed terminals may be explicitly reopened for another review.
  NOT_ELIGIBLE: ["UNDER_REVIEW"],
  CANCELLED: ["UNDER_REVIEW"],
};

export function nextRefundStatuses(from: string): RefundStatus[] {
  return REFUND_TRANSITIONS[from as RefundStatus] ?? [];
}

export function canTransition(from: string, to: string): boolean {
  return nextRefundStatuses(from).includes(to as RefundStatus);
}

/**
 * Which resolution type a CHOICE_RECEIVED case settles into. Used to validate
 * that "mark refunded" only fires for an original-payment choice, "credit" only
 * for a Ghost-Credit choice, etc.
 */
export function settledStatusForResolution(type: RefundResolutionType): RefundStatus {
  switch (type) {
    case "ORIGINAL_PAYMENT_METHOD":
      return "REFUNDED";
    case "GHOST_CREDIT":
      return "CREDITED";
    case "REPLACEMENT_PRODUCT":
      return "REPLACED";
  }
}

/** Short admin hint for the "next recommended action" column. */
export function refundNextAction(status: string): string {
  switch (status as RefundStatus) {
    case "REQUESTED":
      return "Commencer l’examen";
    case "UNDER_REVIEW":
      return "Décider ou demander des infos";
    case "INFORMATION_REQUIRED":
      return "En attente du client";
    case "CUSTOMER_RESPONDED":
      return "Examiner la réponse";
    case "APPROVED_AWAITING_CHOICE":
      return "En attente du choix client";
    case "CHOICE_RECEIVED":
      return "Traiter la résolution";
    case "REFUND_PROCESSING":
      return "Marquer comme remboursée";
    case "REPLACEMENT_PENDING":
      return "Livrer le remplacement";
    case "REFUNDED":
    case "CREDITED":
    case "REPLACED":
      return "Terminé";
    case "NOT_ELIGIBLE":
      return "Refusée";
    case "CANCELLED":
      return "Annulée";
    default:
      return "—";
  }
}

/** Admin-queue grouping used by the tabs/filters. */
export type RefundQueueTab =
  | "new"
  | "review"
  | "info_required"
  | "responded"
  | "awaiting_customer"
  | "choice_received"
  | "to_process"
  | "completed"
  | "not_eligible"
  | "all";

export const REFUND_QUEUE_TABS: { id: RefundQueueTab; label: string }[] = [
  { id: "new", label: "Nouvelles demandes" },
  { id: "review", label: "En examen" },
  { id: "info_required", label: "Informations demandées" },
  { id: "responded", label: "Réponses reçues" },
  { id: "awaiting_customer", label: "En attente du client" },
  { id: "choice_received", label: "Choix reçus" },
  { id: "to_process", label: "À traiter" },
  { id: "completed", label: "Terminées" },
  { id: "not_eligible", label: "Non éligibles" },
  { id: "all", label: "Toutes" },
];

/** The set of workflow statuses a queue tab maps to (empty = all). */
export function statusesForQueueTab(tab: RefundQueueTab): RefundStatus[] {
  switch (tab) {
    case "new":
      return ["REQUESTED"];
    case "review":
      return ["UNDER_REVIEW"];
    case "info_required":
      return ["INFORMATION_REQUIRED"];
    case "responded":
      return ["CUSTOMER_RESPONDED"];
    case "awaiting_customer":
      return ["APPROVED_AWAITING_CHOICE"];
    case "choice_received":
      return ["CHOICE_RECEIVED"];
    case "to_process":
      return ["CHOICE_RECEIVED", "REFUND_PROCESSING", "REPLACEMENT_PENDING"];
    case "completed":
      return ["REFUNDED", "CREDITED", "REPLACED"];
    case "not_eligible":
      return ["NOT_ELIGIBLE"];
    case "all":
    default:
      return [];
  }
}
