/** Customer-facing French labels for each order status. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  awaiting_payment: "En attente de paiement",
  pending_payment: "En attente de paiement",
  payment_submitted: "Paiement en vérification",
  payment_confirmed: "Paiement confirmé",
  processing: "En préparation",
  // The admin flagged the proof: the customer must send a new one. Never
  // "en vérification" — that is payment_submitted, and the payment page body
  // for this status already says "Justificatif à renvoyer".
  payment_issue: "Justificatif à renvoyer",
  delivered: "Livrée",
  rejected: "Paiement refusé",
  refunded: "Remboursée",
  cancelled: "Annulée",
};

/** Short French status badge text. */
export const ORDER_STATUS_SHORT: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusShort(status: string): string {
  return ORDER_STATUS_SHORT[status] ?? status;
}

/** Tailwind classes for a status chip. */
export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "delivered":
      return "border-green-500/40 text-green-400";
    case "payment_confirmed":
      return "border-accent/40 text-accent";
    case "payment_submitted":
    case "payment_issue":
    case "processing":
      return "border-blue-500/40 text-blue-400";
    case "rejected":
    case "cancelled":
      return "border-red-500/40 text-red-400";
    case "refunded":
      return "border-purple-500/40 text-purple-400";
    case "pending":
    case "awaiting_payment":
    case "pending_payment":
    default:
      return "border-amber-500/40 text-amber-400";
  }
}

export function isDelivered(status: string): boolean {
  return status === "delivered";
}

/**
 * Pre-payment states where no proof has been submitted and no payment captured.
 * This is the single source of truth shared by the UI and the server-side
 * cancellation guard — do not introduce a parallel status list.
 */
export const PENDING_PAYMENT_STATUSES = [
  "pending_payment",
  "pending",
  "awaiting_payment",
] as const;

export function isPendingPayment(status: string): boolean {
  return (PENDING_PAYMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a customer may self-cancel an order. Only the pre-payment states are
 * safe: once a proof is submitted (payment_submitted) or the payment is
 * confirmed/delivered/refunded, the customer must contact support so a payment
 * already sent is never hidden by a self-service cancellation.
 */
export function canCustomerCancel(status: string): boolean {
  return isPendingPayment(status);
}

export function isPaymentSubmitted(status: string): boolean {
  return status === "payment_submitted";
}

export function isPaymentConfirmed(status: string): boolean {
  return status === "payment_confirmed" || status === "delivered";
}

export function isRejectedOrIssue(status: string): boolean {
  return status === "rejected" || status === "payment_issue";
}

export function isRefunded(status: string): boolean {
  return status === "refunded";
}

/**
 * Terminal states: nothing more can happen to the order, so the payment page
 * stops polling. Rejected / payment_issue are NOT terminal — the customer
 * resubmits a justificatif and the admin confirms.
 */
export function isTerminalStatus(status: string): boolean {
  return status === "delivered" || status === "cancelled" || status === "refunded";
}

/**
 * Payment-event timeline notes are internal admin free-text (see
 * reviewTimelineNote in app/actions/payments.ts) — they are never customer
 * copy. They ride the same DTO as the status timeline, so they are gated on
 * the caller being identity-authorized, exactly like the name/email fields.
 */
export function customerVisibleEventNote(
  note: string | null,
  identityAuthorized: boolean,
): string | null {
  return identityAuthorized ? note : null;
}

export type PaymentPageBadge = {
  label: string;
  color: string;
  bg: string;
  bd: string;
  dot: string;
};

const BADGE_AMBER = {
  color: "#F0C466",
  bg: "rgba(232,168,56,0.12)",
  bd: "rgba(232,168,56,0.26)",
  dot: "#E8A838",
};
const BADGE_BLUE = {
  color: "#8DB4FF",
  bg: "rgba(62,123,250,0.12)",
  bd: "rgba(62,123,250,0.28)",
  dot: "#3E7BFA",
};
const BADGE_RED = {
  color: "#E8A6A6",
  bg: "rgba(224,92,92,0.12)",
  bd: "rgba(224,92,92,0.28)",
  dot: "#E05C5C",
};
const BADGE_PURPLE = {
  color: "#C9A6F0",
  bg: "rgba(155,92,224,0.12)",
  bd: "rgba(155,92,224,0.28)",
  dot: "#9B5CE0",
};

/**
 * Badge shown in the payment-page header. Every status in
 * ORDER_STATUS_LABELS resolves here — an unmapped status must never fall
 * through to the amber "En attente de paiement" chip, which would tell a
 * refunded or cancelled customer to pay again.
 */
export function paymentPageBadge(status: string): PaymentPageBadge {
  const label = orderStatusLabel(status);
  switch (status) {
    case "payment_submitted":
    case "processing":
    case "payment_confirmed":
    case "delivered":
      return { label, ...BADGE_BLUE };
    case "rejected":
    case "payment_issue":
    case "cancelled":
      return { label, ...BADGE_RED };
    case "refunded":
      return { label, ...BADGE_PURPLE };
    default:
      return { label: isPendingPayment(status) ? label : "En attente de paiement", ...BADGE_AMBER };
  }
}

/** Payment-page H1 for a status. */
export function paymentPageHeadline(status: string): string {
  switch (status) {
    case "cancelled":
      return "Commande annulée";
    case "refunded":
      return "Commande remboursée";
    case "delivered":
      return "Commande livrée";
    case "rejected":
    case "payment_issue":
      return "Vérifions votre paiement";
    default:
      return "Finalisez votre paiement";
  }
}

/**
 * Sub-headline for a status, or null for the pre-payment states where the copy
 * depends on the chosen payment method (the page supplies it).
 */
export function paymentPageInstruction(status: string): string | null {
  switch (status) {
    case "cancelled":
      return "Cette commande a été annulée. Aucun paiement n’est requis.";
    case "refunded":
      return "Cette commande a été remboursée. Aucun paiement n’est requis.";
    case "rejected":
    case "payment_issue":
      return "Nous n’avons pas pu valider votre paiement. Consultez le détail ci-dessous.";
    case "payment_confirmed":
      return "Votre paiement a été confirmé. Votre commande est en cours de préparation.";
    case "delivered":
      return "Votre commande est livrée. Vos codes sont disponibles ci-dessous.";
    case "payment_submitted":
    case "processing":
      return "Votre justificatif est en cours de vérification.";
    default:
      return null;
  }
}

export function canDeliver(status: string): boolean {
  return status === "payment_confirmed";
}
