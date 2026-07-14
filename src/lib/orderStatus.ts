/** Customer-facing French labels for each order status. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  awaiting_payment: "En attente de paiement",
  pending_payment: "En attente de paiement",
  payment_submitted: "Paiement en vérification",
  payment_confirmed: "Paiement confirmé",
  processing: "En préparation",
  payment_issue: "Paiement en vérification",
  delivered: "Livrée",
  rejected: "Paiement refusé",
  refunded: "Remboursée",
  cancelled: "Annulée",
  expired: "Expirée",
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
    case "expired":
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

export function canDeliver(status: string): boolean {
  return status === "payment_confirmed";
}
