export type CategoryId =
  | "steam"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "roblox"
  | "valorant";

export interface Category {
  id: CategoryId;
  name: string;
  tagline: string;
  /** Tailwind gradient classes used for the placeholder artwork. */
  gradient: string;
  icon: string;
}

export interface Product {
  // ── Identity ──────────────────────────────────────────────────────────
  id: string;
  name: string;
  category: CategoryId;
  brand?: string;
  region: string;
  deliveryType: string;

  // ── Visibility ────────────────────────────────────────────────────────
  active?: boolean;
  featured?: boolean;

  // ── Face value (what the card is worth in its original currency) ───────
  faceValue?: number;
  faceCurrency?: string; // "EUR" | "USD" | "GBP" | "MAD" | "TRY" | "Robux" | "VP" | …

  // ── Customer pricing ──────────────────────────────────────────────────
  /** Selling price in MAD — what the customer pays. Used by cart/checkout. */
  price: number;

  // ── Supplier cost (admin-only, never shown publicly) ──────────────────
  supplierCost?: number;
  supplierCurrency?: string;

  // ── Descriptions ──────────────────────────────────────────────────────
  description: string;       // kept for backwards compat (= shortDescription)
  shortDescription?: string;
  longDescription?: string;

  // ── Redemption instructions ────────────────────────────────────────────
  instructions?: string;

  // ── Media ─────────────────────────────────────────────────────────────
  thumbnail?: string;
  galleryImages?: string[];
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  /**
   * Codes assigned by an admin during manual fulfillment. Empty until the
   * order is delivered — checkout no longer auto-assigns codes.
   */
  codes: string[];
}

export type PaymentMethod =
  | "test"
  | "bank"
  | "crypto"
  | "paypal";

/**
 * Manual fulfillment lifecycle:
 *  pending_payment   -> order placed, awaiting admin payment review
 *  payment_confirmed -> admin verified payment, code not yet assigned
 *  delivered         -> code(s) assigned and visible to the customer
 *  cancelled         -> placeholder for refunds/cancellations
 */
export type OrderStatus =
  | "pending_payment"
  | "payment_confirmed"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  createdAt: string;
  email: string;
  fullName: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentConfirmedAt?: string;
  deliveredAt?: string;
}

/** Simulated transactional emails — logged only, never actually sent. */
export type EmailType = "order_received" | "code_delivered";

export interface EmailLog {
  id: string;
  orderId: string;
  type: EmailType;
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}

/** A single redeemable code tracked in the local mock inventory. */
export interface InventoryCode {
  id: string;
  productId: string;
  code: string;
  status: "unused" | "used";
  assignedOrderId?: string;
  usedAt?: string;
}
