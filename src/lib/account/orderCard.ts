/**
 * Presentation helpers for the account order cards. Structurally typed so they
 * stay free of Prisma/`getAccountOrders` imports and remain unit-testable.
 */
export type OrderCardItem = {
  quantity: number;
  product: { name: string };
  variant: { name: string } | null;
};

export type OrderCardOrder = {
  items: OrderCardItem[];
};

/** Total number of units in the order (quantities included, not line count). */
export function orderItemCount(order: OrderCardOrder): number {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

export function orderItemCountLabel(order: OrderCardOrder): string {
  const count = orderItemCount(order);
  if (count <= 0) return "Aucun article";
  return `${count} article${count > 1 ? "s" : ""}`;
}

/**
 * Card title. A single-line order shows the product it contains; a multi-line
 * order gets a generic summary rather than one product's name standing in for
 * the whole basket.
 */
export function orderCardSummary(order: OrderCardOrder): string {
  const firstItem = order.items[0];
  if (!firstItem) return "Commande";

  const productName = firstItem.variant?.name || firstItem.product.name;
  if (order.items.length <= 1) return productName;

  const otherLines = order.items.length - 1;
  return `${productName} + ${otherLines} autre${otherLines > 1 ? "s" : ""}`;
}
