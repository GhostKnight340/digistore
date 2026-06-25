export type CategoryId =
  | "steam"
  | "playstation"
  | "xbox"
  | "nintendo"
  | "roblox"
  | "valorant";

// ── Variant / parent product types ────────────────────────────────────────────

export interface ProductVariant {
  /** Slug used as cart key and DB Product.slug, e.g. "steam-50" */
  id: string;
  /** Parent product id, e.g. "steam-wallet" */
  productId: string;
  faceValue: number;
  /** ISO currency code or token name: "MAD" | "EUR" | "USD" | "GBP" | "TRY" | "Robux" | "VP" */
  faceCurrency: string;
  /** Selling price in MAD — what the customer pays */
  price: number;
  supplierCost?: number;
  supplierCurrency?: string;
  active?: boolean;
  featured?: boolean;
  sku?: string;
}

export interface ParentProduct {
  id: string;
  name: string;
  category: CategoryId;
  brand?: string;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription?: string;
  longDescription?: string;
  instructions?: string;
  thumbnail?: string;
  backgroundPreset?: string;
  galleryImages?: string[];
  active?: boolean;
  variants: ProductVariant[];
}

export interface Category {
  id: CategoryId;
  name: string;
  tagline: string;
  /** Tailwind gradient classes used for the placeholder artwork. */
  gradient: string;
  icon: string;
}

/**
 * Flat "variant as product" shape used throughout cart/checkout/cards.
 * `id` = variant slug (same as DB Product.slug), `variantOf` = parent product id.
 */
export interface Product {
  id: string;
  /** Parent product id — used to build the correct href /products/{variantOf}?v={id} */
  variantOf?: string;
  name: string;
  category: CategoryId;
  brand?: string;
  region: string;
  deliveryType: string;
  active?: boolean;
  featured?: boolean;
  faceValue?: number;
  faceCurrency?: string;
  /** Selling price in MAD */
  price: number;
  supplierCost?: number;
  supplierCurrency?: string;
  description: string;
  shortDescription?: string;
  longDescription?: string;
  instructions?: string;
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
