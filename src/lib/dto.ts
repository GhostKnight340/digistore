import type { OrderStatus } from "./types";

// Plain serializable shapes passed between server (DB) and client components.
// `productId` always refers to the catalog SLUG (e.g. "steam-100") so existing
// UI helpers like getProduct(slug) keep working.

export interface OrderItemDTO {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMad: number;
  // Present only when the item's variant is Reloadly-sourced
  // (variant.stockControl === "reloadly"); lets the delivery UI offer an
  // "auto-fulfill via Reloadly" option instead of local/manual code entry.
  variantStockControl?: string;
  variantReloadlyProductId?: number | null;
  variantReloadlyCountryCode?: string | null;
}

/**
 * A single normalized provider delivery field. Providers like Reloadly return
 * richer payloads than one code — a card number/code, a PIN, and sometimes a
 * redemption URL — so each is kept separate and labelled on the delivery page.
 * Only the fields that actually exist for that product are set.
 */
export interface DeliveredFieldDTO {
  code?: string;
  pin?: string;
  url?: string;
  instructions?: string;
}

export interface DeliveredCodeDTO {
  productId: string;
  orderItemId?: string;
  /** Compact single-value representation (local/manual code, or primary provider value). */
  code: string;
  /**
   * Structured provider fields when the delivery payload is richer than a
   * single code (e.g. Reloadly). Absent for plain local/manual single codes.
   */
  fields?: DeliveredFieldDTO[];
}

export interface PaymentEventDTO {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

/** Customer-safe order view — only this order's delivered codes, no inventory. */
export interface CustomerOrderDTO {
  id: string;
  publicOrderNumber: string;
  publicOrderPathSegment: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  totalMad: number;
  createdAt: string;
  items: OrderItemDTO[];
  deliveredCodes: DeliveredCodeDTO[];
  proofUploaded: boolean;
  paymentEvents: PaymentEventDTO[];
  paymentProvider: string | null;
  paymentProviderOrderId: string | null;
  paymentProviderStatus: string | null;
  paymentConfirmedAt: string | null;
}

export interface EmailLogDTO {
  id: string;
  type: string;
  templateKey: string | null;
  recipient: string;
  subject: string;
  body: string;
  html: string;
  text: string;
  provider: string;
  providerMessageId: string | null;
  status: string;
  errorMessage: string | null;
  manuallyEdited: boolean;
  createdAt: string;
}

/** Admin order view — adds simulated email logs. */
export interface AdminOrderDTO extends CustomerOrderDTO {
  emailLogs: EmailLogDTO[];
  proofMimeType: string | null;
}

export interface AdminPaymentProofDTO {
  data: string;
  mimeType: string;
  fileName: string;
  uploadedAt: string;
  sizeBytes: number | null;
  source: "base64" | "url";
}

export interface AdminOrderSummaryDTO {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  /** Resolved customer-facing method name. Orders store the method id (a cuid)
   * rather than a friendly label, so this is computed from the payment-method
   * config; falls back to a legacy label map then a generic label. */
  paymentMethodLabel: string;
  totalMad: number;
  createdAt: string;
  items: OrderItemDTO[];
  proofUploaded: boolean;
  proofMimeType: string | null;
}

export interface AdminStatsDTO {
  totalOrders: number;
  pendingCount: number;
  totalRevenue: number;
  customerCount: number;
}

export interface AdminCodeDTO {
  id: string;
  code: string;
  status: string;
  variantId: string | null;
  assignedOrderId: string | null;
  usedAt: string | null;
  createdAt: string;
}

export interface InventoryGroupDTO {
  productId: string;
  productName: string;
  total: number;
  unused: number;
  reserved: number;
  used: number;
  disabled: number;
  codes: AdminCodeDTO[];
}

export interface InventorySummaryDTO {
  productId: string;
  productName: string;
  unused: number;
  reserved: number;
  used: number;
  disabled: number;
  total: number;
}

export interface InventoryVariantDTO {
  productId: string;
  variantId: string | null;
  name: string;
  legacy: boolean;
  unused: number;
  reserved: number;
  used: number;
  disabled: number;
  total: number;
  lastUpdatedAt: string | null;
}

export interface InventoryProductDTO {
  productId: string;
  productName: string;
  category: string;
  variantCount: number;
  unused: number;
  reserved: number;
  used: number;
  disabled: number;
  total: number;
  lastUpdatedAt: string | null;
  variants: InventoryVariantDTO[];
}

export interface ProductListItemDTO {
  slug: string;
  name: string;
  category: string;
  region: string;
  active: boolean;
  variantCount: number;
}

export interface AdminCategoryDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
  productCount: number;
}

export interface SaveCategoryInput {
  originalId?: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
}

export interface DeleteParentProductInput {
  slug: string;
  variantStrategy: "delete" | "move";
  targetParentSlug?: string;
}

export interface ConvertProductToVariantInput {
  sourceSlug: string;
  targetParentSlug: string;
  removeSource: boolean;
}

// Product management DTOs restored from the historical admin editor. The
// current DB maps parent fields to Product and variant fields to ProductVariant.
export interface VariantDTO {
  id: string;
  slug: string;
  name: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  supplierCost: number | null;
  supplierCurrency: string;
  active: boolean;
  featured: boolean;
  stockControl: string;
  stockMode: string;
  inventoryUnused: number;
  reloadlyProductId: number | null;
  reloadlyCountryCode: string | null;
}

export interface ParentProductDTO {
  slug: string;
  name: string;
  category: string;
  brand: string | null;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription: string | null;
  longDescription: string | null;
  instructions: string | null;
  thumbnail: string | null;
  active: boolean;
  featured: boolean;
  createdAt: string;
  variants: VariantDTO[];
}

export interface SaveParentProductInput {
  originalSlug?: string; // WHERE key for updates; absent means create new
  slug: string;
  name: string;
  category: string;
  brand: string | null;
  region: string;
  deliveryType: string;
  description: string;
  shortDescription: string | null;
  longDescription: string | null;
  instructions: string | null;
  thumbnail: string | null;
  active: boolean;
  featured: boolean;
}

export interface SaveVariantInput {
  originalSlug?: string;
  slug: string;
  name: string;
  parentSlug: string;
  category: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  supplierCost: number | null;
  supplierCurrency: string;
  region: string;
  deliveryType: string;
  active: boolean;
  featured: boolean;
  stockControl: string;
  stockMode: string;
  reloadlyProductId: number | null;
  reloadlyCountryCode: string | null;
}

export interface FeaturedVariantOptionDTO {
  id: string;
  productName: string;
  variantName: string;
  displayName: string;
  priceMad: number;
  category: string;
  categoryName: string;
  productActive: boolean;
  variantActive: boolean;
  featured: boolean;
}

export interface CustomerDTO {
  id: string | null;
  email: string;
  phone: string | null;
  name: string;
  kind: "registered" | "guest";
  emailVerified: boolean;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface AdminOverviewDTO {
  totalOrders: number;
  pendingFulfillment: number;
  totalRevenue: number;
  customers: number;
  recentOrders: AdminOrderSummaryDTO[];
}

export interface AdminOverviewMetricsDTO {
  /** Revenue over the trailing 7 days, in MAD. */
  revenue7: number;
  /** Percentage change vs the previous 7 days, or null when there is no baseline. */
  revenueDeltaPct: number | null;
  /** Order count over the trailing 7 days. */
  orders7: number;
  ordersDeltaPct: number | null;
  /** Orders sitting in payment review. */
  awaitingReview: number;
  /** Minutes the oldest payment-review order has been waiting, or null when the queue is empty. */
  oldestReviewWaitMin: number | null;
  /** Daily revenue for the trailing 7 days (oldest → newest), for the bar chart. */
  revenueSeries: { label: string; value: number; highlight: boolean }[];
  revenueAvgPerDay: number;
  /** The payment-review queue preview (oldest first). */
  queue: { id: string; ref: string; label: string; waitMin: number }[];
}

/** A single delivery assignment entry: either an inventory code or a manual one. */
export interface AssignmentEntry {
  digitalCodeId?: string;
  manualCode?: string;
  // Presence signals "fetch this code live from Reloadly at delivery time"
  // instead of using a local/manual code. Mutually exclusive with the two
  // fields above.
  reloadlyProductId?: number;
}

export interface ItemAssignment {
  orderItemId: string;
  codes: AssignmentEntry[];
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ─── Payment method DTOs ──────────────────────────────────────────────────────

export type PaymentMethodType = "bank" | "paypal" | "crypto" | "card" | "cash" | "custom";
export type PaymentMethodStatus = "active" | "inactive";
export type PaymentMethodLogoType = "initials" | "image" | "icon";

/** Loosely-typed per-type payment fields, stored as JSON. Every field optional
 * since a draft method may have any of them blank. */
export interface PaymentMethodDetails {
  // bank
  accountNumber?: string;
  rib?: string;
  bankName?: string;
  accountHolder?: string;
  iban?: string;
  swift?: string;
  // paypal
  email?: string;
  meLink?: string;
  buttonLabel?: string;
  /** ISO 4217 settlement currency for the automated PayPal flow (MAD is not
   * supported by PayPal). Defaults to "USD" when unset. */
  paypalCurrency?: string;
  /** MAD per 1 unit of `paypalCurrency`, used to convert the order total.
   * Defaults to 10 when unset. */
  paypalExchangeRate?: number;
  // crypto
  walletAddress?: string;
  network?: string;
  minAmountNote?: string;
  // card
  providerName?: string;
  statusNote?: string;
  comingSoon?: boolean;
  // cash / custom
  customLabel?: string;
  fields?: { label: string; value: string }[];
  // shared free-text instructions, meaning varies slightly by type
  instructions?: string;
}

export interface PaymentMethodDTO {
  id: string;
  type: PaymentMethodType;
  name: string;
  subtitle: string;
  customerNote: string;
  status: PaymentMethodStatus;
  visible: boolean;
  sortOrder: number;
  logoUrl: string | null;
  initials: string;
  accentColor: string;
  logoType: PaymentMethodLogoType;
  details: PaymentMethodDetails;
  proofRequired: boolean;
  internalNote: string;
  minAmount: number | null;
  maxAmount: number | null;
  regions: string[];
  archivedAt: string | null;
  updatedAt: string;
}

export interface SaveMethodInput {
  type: PaymentMethodType;
  name: string;
  subtitle: string;
  customerNote: string;
  status: PaymentMethodStatus;
  visible: boolean;
  logoUrl: string | null;
  initials: string;
  accentColor: string;
  logoType: PaymentMethodLogoType;
  details: PaymentMethodDetails;
  proofRequired: boolean;
  internalNote: string;
  minAmount: number | null;
  maxAmount: number | null;
  regions: string[];
}

export interface SupportConfigDTO {
  id: string;
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}

export interface PaymentConfigDTO {
  methods: PaymentMethodDTO[];
  support: SupportConfigDTO;
}

export interface PaymentMethodValidation {
  complete: boolean;
  fieldErrors: Record<string, string>;
}

// ─── Provider / Reloadly (API fournisseur) DTOs ───────────────────────────────

export type SupplierEnvironment = "sandbox" | "live";
export type SupplierTimeRange = "today" | "7d" | "30d";

/** Static, config-derived provider state (no external API call). */
export interface ReloadlyOverviewDTO {
  configured: boolean;
  environment: SupplierEnvironment;
  /** Delivery is admin-triggered; there is no automatic fulfillment today. */
  automaticFulfillment: boolean;
  /** Reloadly gift cards is synchronous — no webhook exists. */
  webhook: "configured" | "not_configured" | "not_applicable";
}

/** Result of an explicit, read-only connection/auth test. */
export interface ReloadlyHealthDTO {
  ok: boolean;
  configured: boolean;
  authWorking: boolean;
  environment: SupplierEnvironment;
  checkedAt: string;
  /** Wallet balance if the account/permissions expose it; null otherwise. */
  balance: { amount: number; currency: string } | null;
  /** Safe error message (status + provider message only), never credentials. */
  error: string | null;
}

export interface ReloadlyMetricsDTO {
  linkedProducts: number;
  unlinkedProducts: number;
  /** Successful Reloadly deliveries within the selected range. */
  providerOrders: number;
  range: SupplierTimeRange;
}

export type ReloadlyMappingStatus = "linked" | "incomplete" | "unlinked" | "disabled";

export interface ReloadlyMappingDTO {
  variantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  region: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  reloadlyProductId: number | null;
  reloadlyCountryCode: string | null;
  status: ReloadlyMappingStatus;
}

export interface ReloadlyProviderOrderDTO {
  deliveredCodeId: string;
  orderId: string;
  publicOrderNumber: string;
  productName: string;
  reloadlyTransactionId: number | null;
  environment: SupplierEnvironment;
  status: "successful";
  createdAt: string;
}

export interface ReloadlyCatalogProductDTO {
  productId: number;
  productName: string;
  brandName: string;
  country: string;
  countryName: string;
  currency: string;
  denominationType: string;
  fixedDenominations: number[];
  minDenomination: number | null;
  maxDenomination: number | null;
  /** True when a Ghost variant already maps to this Reloadly product. */
  mapped: boolean;
}

export interface ReloadlyCatalogPageDTO {
  products: ReloadlyCatalogProductDTO[];
  page: number;
  totalPages: number;
  totalElements: number;
}

/** Read-only validation that a Reloadly product fits a Ghost variant. */
export interface ReloadlyAvailabilityDTO {
  ok: boolean;
  productId: number;
  productName: string | null;
  country: string | null;
  currency: string | null;
  denominationType: string | null;
  fixedDenominations: number[];
  /** Mismatches (currency / country / denomination) in French, if any. */
  issues: string[];
  error: string | null;
}
