import type { OrderStatus } from "./types";

/** Customer-facing French labels for each order status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  payment_submitted: "Paiement soumis — vérification en cours",
  payment_confirmed: "Paiement confirmé",
  payment_issue: "Problème de paiement",
  rejected: "Paiement refusé",
  delivered: "Commande livrée",
  refunded: "Remboursé",
  cancelled: "Commande annulée",
};

/** Short French status badge text. */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pending_payment: "En attente",
  payment_submitted: "En vérification",
  payment_confirmed: "Paiement confirmé",
  payment_issue: "Problème",
  rejected: "Refusé",
  delivered: "Livrée",
  refunded: "Remboursé",
  cancelled: "Annulée",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

export function orderStatusShort(status: string): string {
  return ORDER_STATUS_SHORT[status as OrderStatus] ?? status;
}

/** Tailwind classes for a status chip. */
export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "delivered":
      return "border-green-500/40 text-green-400";
    case "payment_confirmed":
      return "border-accent/40 text-accent";
    case "payment_submitted":
      return "border-blue-500/40 text-blue-400";
    case "payment_issue":
      return "border-orange-500/40 text-orange-400";
    case "rejected":
    case "cancelled":
      return "border-red-500/40 text-red-400";
    case "refunded":
      return "border-purple-500/40 text-purple-400";
    case "pending_payment":
    default:
      return "border-amber-500/40 text-amber-400";
  }
}

export function isDelivered(status: string): boolean {
  return status === "delivered";
}

export function isPendingPayment(status: string): boolean {
  return status === "pending_payment";
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
