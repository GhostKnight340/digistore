export type CategoryId =
  | "steam"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "roblox"
  | "valorant";

export interface Category {
  id: string;
  name: string;
  tagline: string;
  /** Tailwind gradient classes used for the placeholder artwork. */
  gradient: string;
  icon: string;
  productCount?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  categoryName?: string;
  region: string;
  /** Price in Moroccan Dirham. */
  price: number;
  deliveryType: string;
  description: string;
  featured?: boolean;
  stockStatus?: StockStatus;
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
   * order is delivered.
   */
  codes: string[];
}

export type PaymentMethod =
  | "bank"
  | "usdt"
  | "crypto"
  | "paypal"
  | "card"
  | "test";

export type StockMode = "automatic" | "force_in_stock" | "force_out_of_stock";
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

/**
 * Full payment lifecycle:
 *  pending_payment   -> order placed, customer must send payment
 *  payment_submitted -> customer submitted proof, awaiting admin review
 *  payment_confirmed -> admin verified payment, awaiting delivery
 *  payment_issue     -> admin flagged an issue with payment
 *  rejected          -> admin rejected the payment
 *  delivered         -> code(s) assigned and visible to the customer
 *  refunded          -> future: customer refunded
 *  cancelled         -> order cancelled
 */
export type OrderStatus =
  | "pending_payment"
  | "payment_submitted"
  | "payment_confirmed"
  | "payment_issue"
  | "rejected"
  | "delivered"
  | "refunded"
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

/** Simulated transactional emails are logged only, never actually sent. */
export type EmailType =
  | "order_received"
  | "payment_submitted"
  | "payment_confirmed"
  | "payment_rejected"
  | "payment_issue"
  | "code_delivered";

export interface EmailLog {
  id: string;
  orderId: string;
  type: EmailType;
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}

/** A single redeemable inventory code tracked in PostgreSQL. */
export interface InventoryCode {
  id: string;
  productId: string;
  code: string;
  status: "unused" | "used";
  assignedOrderId?: string;
  usedAt?: string;
}
