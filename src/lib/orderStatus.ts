import type { OrderStatus } from "./types";

/** Customer-facing French labels for each order status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Paiement en cours de vérification",
  payment_confirmed: "Paiement confirmé",
  delivered: "Commande livrée",
  cancelled: "Commande annulée",
};

/** Short French status badge text. */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pending_payment: "En vérification",
  payment_confirmed: "Paiement confirmé",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusShort(status: OrderStatus): string {
  return ORDER_STATUS_SHORT[status] ?? status;
}

/** Tailwind classes for a status chip. */
export function orderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case "delivered":
      return "border-green-500/40 text-green-400";
    case "payment_confirmed":
      return "border-accent/40 text-accent";
    case "cancelled":
      return "border-red-500/40 text-red-400";
    case "pending_payment":
    default:
      return "border-amber-500/40 text-amber-400";
  }
}

export function isDelivered(status: OrderStatus): boolean {
  return status === "delivered";
}
