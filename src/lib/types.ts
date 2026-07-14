export type CategoryId = string;

export interface Category {
  id: string;
  slug?: string;
  /** Keyword-rich URL slug for the /categorie/<seoSlug> landing page. */
  seoSlug?: string | null;
  name: string;
  description?: string;
  tagline: string;
  /** Tailwind gradient classes used for the placeholder artwork. */
  gradient: string;
  icon: string;
  iconUrl?: string | null;
  coverImageUrl?: string | null;
  /** Resolved from a product in the category when no cover/icon is set, so the
   *  card shows real artwork instead of the placeholder. Never overrides an
   *  admin-set cover. */
  fallbackImageUrl?: string | null;
  accentColor?: string;
  active?: boolean;
  sortOrder?: number;
  productCount?: number;
  /** Optional rich landing-page content; present on detail fetches. */
  landing?: import("./categoryLanding").CategoryLanding;
}

export interface Product {
  id: string;
  parentId?: string;
  variantId?: string;
  href?: string;
  name: string;
  category: string;
  categoryName?: string;
  region: string;
  /** Denomination face value / currency of the underlying variant, when this
   * Product is a variant-flattened catalogue row. Used to form a stable natural
   * key so carts survive SKU/id renames (see lib/cartIdentity.ts). */
  faceValue?: number | null;
  faceCurrency?: string;
  /** Price in Moroccan Dirham. */
  price: number;
  deliveryType: string;
  /** Meta-description / fallback text. */
  description: string;
  /** Short tagline shown on category/catalogue cards. */
  shortDescription?: string | null;
  /** Full description shown on the product detail page. */
  longDescription?: string | null;
  imageUrl?: string | null;
  featured?: boolean;
  stockStatus?: StockStatus;
  variants?: ProductVariantOption[];
  selectedVariantId?: string;
}

/** Compact parent-product row returned by the header autocomplete search. */
export interface ProductSearchResult {
  /** Parent product slug — also the product-page path segment. */
  id: string;
  href: string;
  name: string;
  category: string;
  categoryName: string;
  region: string;
  /** Lowest price (in MAD) across the product's public variants. */
  price: number;
  imageUrl?: string | null;
}

/**
 * A collection resolved for the storefront: metadata plus its live parent
 * product cards (already visibility-filtered and, for the homepage, limited).
 */
export interface StorefrontCollection {
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  imageUrl?: string | null;
  ctaLabel: string;
  /** Section title for the homepage (falls back to `name`). */
  homepageTitle: string;
  seoTitle: string;
  seoDescription: string;
  socialImageUrl?: string | null;
  products: Product[];
}

/** A category match in the public grouped search. */
export interface CategorySearchResult {
  id: string;
  name: string;
  href: string;
}

/** A collection match in the public grouped search. */
export interface CollectionSearchResult {
  slug: string;
  name: string;
  href: string;
  /** Short description shown as a secondary line under the name. */
  shortDescription: string;
  /** Approved icon key for the result glyph (see collections/icons.ts). */
  icon: import("./collections/icons").CollectionIconKey;
}

/**
 * A compact collection card for the homepage "Explorer les collections" section
 * and the /collections index — metadata + an eligible parent-product count only,
 * never resolved product cards. Keeps the homepage light (no per-collection
 * product queries).
 */
export interface HomepageCollectionCard {
  slug: string;
  /** Card title (homepageTitle override, else name). */
  title: string;
  shortDescription: string;
  imageUrl: string | null;
  /** Resolved approved icon key (admin icon → derived → fallback). */
  icon: import("./collections/icons").CollectionIconKey;
  /** Restrained accent hex, or null → default Ghost blue. */
  accentColor: string | null;
  ctaLabel: string;
  /** Count of eligible/public PARENT products in this collection. */
  productCount: number;
}

/** Grouped public-search payload returned by /api/search and the results page. */
export interface SearchGroupsResult {
  query: string;
  products: ProductSearchResult[];
  categories: CategorySearchResult[];
  collections: CollectionSearchResult[];
  /** More product matches exist beyond the previewed slice. */
  hasMore: boolean;
}

export interface ProductVariantOption {
  id: string;
  name: string;
  title: string;
  price: number;
  faceValue: number | null;
  faceCurrency: string;
  /** Resolved region (variant.region ?? parent product region). */
  region: string;
  active: boolean;
  featured: boolean;
  stockMode: StockMode;
  stockStatus: StockStatus;
}

export interface CartItem {
  productId: string;
  quantity: number;
  /** Natural-key identity captured at add-time so a stale item (whose SKU/id was
   * renamed) can re-bind to the current variant. Absent on legacy v1 items. */
  parentId?: string;
  faceValue?: number | null;
  faceCurrency?: string;
  region?: string;
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
export type StockStatus = "in_stock" | "out_of_stock";

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

/**
 * Promo-code reward type. Exactly one per code. Stored as a String column on
 * PromoCode (see prisma/schema.prisma) — never a Prisma enum, matching the
 * project convention of TS unions + documented String columns.
 *   PERCENT_DISCOUNT     — % off the eligible subtotal, optional max discount cap
 *   FIXED_DISCOUNT       — fixed DH off the eligible subtotal
 *   FIXED_GHOST_CREDIT   — fixed DH of Ghost Credit granted after payment
 *   PERCENT_GHOST_CREDIT — % of eligible subtotal as Ghost Credit, optional cap
 */
export type PromoRewardType =
  | "PERCENT_DISCOUNT"
  | "FIXED_DISCOUNT"
  | "FIXED_GHOST_CREDIT"
  | "PERCENT_GHOST_CREDIT";

/** Whether a reward is an immediate discount or a post-payment Ghost Credit. */
export type PromoRewardKind = "discount" | "credit";

/**
 * Computed promo-code lifecycle status (never stored — derived from active,
 * archivedAt, the validity window, and usage vs. limit).
 *   active    — usable now
 *   scheduled — has a future startAt
 *   expired   — past endAt
 *   exhausted — hit its total usage limit
 *   archived  — soft-archived by an admin
 *   disabled  — active toggle is off
 */
export type PromoCodeStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "exhausted"
  | "archived"
  | "disabled";

/** Ghost Credit ledger transaction direction. */
export type GhostCreditDirection = "credit" | "debit";

/** Ghost Credit ledger transaction status. */
export type GhostCreditStatus = "active" | "reversed" | "expired";

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
