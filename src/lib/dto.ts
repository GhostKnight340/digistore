import type {
  OrderStatus,
  PromoRewardType,
  PromoCodeStatus,
  GhostCreditDirection,
  GhostCreditStatus,
} from "./types";
import type { CategoryLanding } from "./categoryLanding";

// Plain serializable shapes passed between server (DB) and client components.
// `productId` always refers to the catalog SLUG (e.g. "steam-100") so existing
// UI helpers like getProduct(slug) keep working.

export interface OrderItemDTO {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMad: number;
  /** Resolved region of the ordered variant (variant.region ?? product.region). */
  variantRegion?: string;
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

/** Discord connection + DM-delivery snapshot for the admin order view. */
export interface AdminOrderDiscordDTO {
  /** Customer's Discord state: none | connected (OAuth only) | activated (DM). */
  connection: "none" | "connected" | "activated";
  deliveryRequested: boolean;
  /** NOT_REQUESTED | PENDING | SENT | FAILED */
  deliveryStatus: string;
  /** Safe failure category only — never a raw payload/code. */
  deliveryError: string | null;
  deliveryAttemptedAt: string | null;
  deliverySentAt: string | null;
}

/** Admin order view — adds simulated email logs. */
export interface AdminOrderDTO extends CustomerOrderDTO {
  emailLogs: EmailLogDTO[];
  proofMimeType: string | null;
  discord: AdminOrderDiscordDTO;
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
  /** Human-friendly sequential order number, e.g. "#000001". */
  publicOrderNumber: string;
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
  seoSlug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
  productCount: number;
  landing: CategoryLanding;
}

export interface SaveCategoryInput {
  originalId?: string;
  slug: string;
  seoSlug: string;
  name: string;
  description: string;
  icon: string;
  iconUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string;
  active: boolean;
  sortOrder: number;
  landing: CategoryLanding;
}

// ─── Collections (curated merchandising groups) ──────────────────────────────

export type CollectionLifecycleState = "inactive" | "upcoming" | "live" | "expired";

/** A parent product referenced by a collection, with live display context. */
export interface CollectionProductRefDTO {
  productId: string;
  slug: string;
  name: string;
  category: string;
  categoryName: string;
  region: string;
  /** Lowest current price (MAD) across public variants; null when none. */
  priceFrom: number | null;
  active: boolean;
  /** False when the product has no public/active variant, so it would not
   *  render on the storefront. Admin-only hint (never hides the row here). */
  eligible: boolean;
}

export interface AdminCollectionDTO {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  /** ISO strings; null means no bound. */
  startAt: string | null;
  endAt: string | null;
  showOnHomepage: boolean;
  homepageTitle: string;
  homepageLimit: number;
  ctaLabel: string;
  seoTitle: string;
  seoDescription: string;
  socialImageUrl: string | null;
  aliases: string[];
  /** Approved homepage-card icon key (empty = derive/fallback). */
  icon: string;
  /** Optional restrained accent hex for the homepage card, or null. */
  accentColor: string | null;
  productCount: number;
  /** Live lifecycle state for the admin status badge. */
  state: CollectionLifecycleState;
  items: CollectionProductRefDTO[];
}

export interface SaveCollectionInput {
  originalId?: string;
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
  showOnHomepage: boolean;
  homepageTitle: string;
  homepageLimit: number;
  ctaLabel: string;
  seoTitle: string;
  seoDescription: string;
  socialImageUrl: string | null;
  aliases: string[];
  /** Approved homepage-card icon key (empty = derive/fallback). */
  icon: string;
  /** Optional restrained accent hex for the homepage card, or null. */
  accentColor: string | null;
  /** Ordered parent-product ids that make up the collection. */
  productIds: string[];
}

/** One planned collection from the "generate from catalogue" tool. */
export interface AutoCollectionPlanDTO {
  slug: string;
  name: string;
  productCount: number;
  /** Names of the products that would be included, in order. */
  productNames: string[];
  showOnHomepage: boolean;
  sortOrder: number;
  skipped: boolean;
  /** Why it was skipped (e.g. fewer than 3 eligible products). */
  reason?: string;
  /** Set only when applied: what happened to this collection. */
  status?: "created" | "updated" | "unchanged";
}

/** Result of a preview (applied=false) or apply (applied=true) run of the
 *  "generate collections from catalogue" admin tool. */
export interface AutoCollectionResultDTO {
  applied: boolean;
  plans: AutoCollectionPlanDTO[];
  /** Products excluded because they are not storefront-eligible. */
  ineligibleCount: number;
  summary: { created: number; updated: number; unchanged: number; skipped: number };
}

/** Lightweight parent-product option for the collection product picker. */
export interface CollectionProductOptionDTO {
  productId: string;
  slug: string;
  name: string;
  category: string;
  categoryName: string;
  region: string;
  priceFrom: number | null;
  active: boolean;
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
  /**
   * Per-variant region (a region-table code, e.g. "US"). Null → the variant
   * inherits its parent product's region. When one parent holds variants with
   * differing regions, the storefront shows a region selector.
   */
  variantRegion: string | null;
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
  /** Parent product's region (used only for the base-product edge case). */
  region: string;
  /** Per-variant region override; null/empty → inherit the parent's region. */
  variantRegion?: string | null;
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
  /** Linked Discord username, if any. */
  discordUsername: string | null;
  /** Discord account that has not yet added a real email (placeholder email). */
  profileIncomplete: boolean;
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

// ─── Promo code & Ghost Credit DTOs ──────────────────────────────────────────

/** A product/category option for the admin applicability multi-selects. */
export interface PromoScopeOptionDTO {
  id: string;
  name: string;
  /** Category name for products (context in the picker), or "" for categories. */
  meta?: string;
}

/** Full promo-code configuration for the admin editor. */
export interface AdminPromoCodeDTO {
  id: string;
  code: string;
  internalName: string;
  description: string;
  active: boolean;
  rewardType: PromoRewardType;
  percentValue: number | null;
  fixedAmountMad: number | null;
  maxDiscountMad: number | null;
  maxCreditMad: number | null;
  creditExpiresInDays: number | null;
  creditExpiresAt: string | null;
  startAt: string | null;
  endAt: string | null;
  maxTotalUses: number | null;
  maxUsesPerCustomer: number | null;
  firstOrderOnly: boolean;
  loggedInOnly: boolean;
  minSubtotalMad: number | null;
  maxSubtotalMad: number | null;
  productIds: string[];
  categoryIds: string[];
  archivedAt: string | null;
  reservedUses: number;
  createdAt: string;
  updatedAt: string;
  /** Derived lifecycle status. */
  status: PromoCodeStatus;
}

/** Compact row for the admin promo-code list. */
export interface AdminPromoCodeSummaryDTO {
  id: string;
  code: string;
  internalName: string;
  rewardType: PromoRewardType;
  rewardTypeLabel: string;
  valueLabel: string;
  status: PromoCodeStatus;
  startAt: string | null;
  endAt: string | null;
  usedCount: number;
  maxTotalUses: number | null;
  scopeLabel: string;
  createdAt: string;
}

/** Aggregate stats + audit history for the promo detail view. */
export interface AdminPromoCodeDetailDTO {
  promo: AdminPromoCodeDTO;
  totalUses: number;
  uniqueCustomers: number;
  remainingUses: number | null;
  totalImmediateDiscountMad: number;
  totalFixedCreditMad: number;
  totalPercentCreditMad: number;
  totalCreditGrantedMad: number;
  averageCreditPerOrderMad: number;
  revenueMad: number;
  eligibleSubtotalGeneratedMad: number;
  orders: PromoOrderUsageDTO[];
  events: PromoCodeEventDTO[];
}

export interface PromoOrderUsageDTO {
  orderId: string;
  publicOrderNumber: string;
  status: OrderStatus;
  redemptionStatus: string;
  totalMad: number;
  discountMad: number;
  expectedCreditMad: number;
  createdAt: string;
}

export interface PromoCodeEventDTO {
  id: string;
  type: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Input for creating/updating a promo code from the admin editor. */
export interface SavePromoCodeInput {
  id?: string;
  code: string;
  internalName: string;
  description?: string;
  active: boolean;
  rewardType: PromoRewardType;
  percentValue?: number | null;
  fixedAmountMad?: number | null;
  maxDiscountMad?: number | null;
  maxCreditMad?: number | null;
  creditExpiresInDays?: number | null;
  creditExpiresAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  maxTotalUses?: number | null;
  maxUsesPerCustomer?: number | null;
  firstOrderOnly?: boolean;
  loggedInOnly?: boolean;
  minSubtotalMad?: number | null;
  maxSubtotalMad?: number | null;
  productIds?: string[];
  categoryIds?: string[];
}

/**
 * Customer-facing promo preview shown at checkout after a code is validated.
 * Immediate-discount vs Ghost Credit is distinguished by `rewardKind`.
 */
export interface PromoPreviewDTO {
  code: string;
  rewardType: PromoRewardType;
  rewardKind: "discount" | "credit";
  eligibleSubtotalMad: number;
  eligibleLineCount: number;
  /** Client ids (slug/variant id) of eligible cart lines, for UI highlighting. */
  eligibleLineKeys: string[];
  discountMad: number;
  creditMad: number;
  percentValue: number | null;
  maxCreditMad: number | null;
}

export interface PromoValidationResultDTO {
  ok: boolean;
  error?: string;
  preview?: PromoPreviewDTO;
  /** True when the failure is specifically "must log in for Ghost Credit". */
  requiresLogin?: boolean;
}

/** A Ghost Credit ledger row for the account wallet + admin view. */
export interface GhostCreditTransactionDTO {
  id: string;
  amountMad: number;
  direction: GhostCreditDirection;
  reason: string;
  status: GhostCreditStatus;
  orderId: string | null;
  promoCode: string | null;
  rewardType: PromoRewardType | null;
  createdAt: string;
  expiresAt: string | null;
  note: string | null;
}

export interface GhostCreditWalletDTO {
  balanceMad: number;
  /** Wallet-wide expiry deadline (60 days after the last credit), or null. */
  expiresAt: string | null;
  transactions: GhostCreditTransactionDTO[];
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
  /** Ghost region implied by the Reloadly card's origin country, if mappable. */
  reloadlyRegion: string | null;
  /** True when the Ghost region label differs from reloadlyRegion (info, not error). */
  regionMismatch: boolean;
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
  /** Informational notes (e.g. a valid cross-currency cost conversion). */
  infos: string[];
  /** Provider cost converted into MAD via the internal FX rate, when the
   *  provider currency differs from the storefront currency. */
  conversion: {
    originalAmount: number;
    originalCurrency: string;
    convertedMad: number;
    rate: number;
  } | null;
  /** Set when the provider currency has no configured FX rate — the UI links
   *  to Tarification to add it. */
  missingRateCurrency: string | null;
  error: string | null;
}

// ─── Pricing subsystem DTOs (Phase 1) ────────────────────────────────────────

/**
 * Per-variant pricing status for the admin table.
 *  - up_to_date       suggested == published
 *  - changed          suggested differs from published (price drift)
 *  - missing_cost     no synced provider cost for this denomination
 *  - missing_fx       cost exists but supplier currency has no internal FX rate
 *  - invalid_mapping  stockControl=reloadly but incomplete/broken mapping
 */
export type PricingRowStatus =
  | "up_to_date"
  | "changed"
  | "missing_cost"
  | "missing_fx"
  | "invalid_mapping";

export type PricingMarginSource =
  | "variant_fixed_price"
  | "variant"
  | "product"
  | "category"
  | "global_default";

export interface PricingRowDTO {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  region: string;
  categoryId: string;
  faceValue: number | null;
  faceCurrency: string;
  reloadlyProductId: number | null;
  reloadlyCountryCode: string | null;
  environment: SupplierEnvironment;

  // Provider cost (supplier currency) + conversion
  providerCost: number | null;
  supplierCurrency: string | null;
  fxRateToMad: number | null;
  costInMad: number | null;
  costSyncedAt: string | null;

  // Suggestion breakdown
  marginSource: PricingMarginSource | null;
  marginPct: number | null;
  rawPriceMad: number | null;
  suggestedPriceMad: number | null;

  // Published price + deltas
  publishedPriceMad: number;
  differenceMad: number | null;
  differencePct: number | null;

  // Expected profitability at the *published* price
  expectedGrossProfitMad: number | null;
  expectedGrossMarginPct: number | null;

  // Policy overrides currently set on this variant/product/category
  variantMarginPct: number | null;
  productMarginPct: number | null;
  categoryMarginPct: number | null;
  variantFixedPriceMad: number | null;

  status: PricingRowStatus;
}

export interface PricingSettingsDTO {
  fxRatesToMad: Record<string, number>;
  defaultMarginPct: number;
  roundingIncrement: 1 | 5 | 10;
  roundingMode: "nearest" | "up";
  costStaleDays: number;
}

export interface PricingLastSyncDTO {
  environment: SupplierEnvironment;
  status: "success" | "partial" | "failed";
  productsSynced: number;
  costsUpserted: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface PricingOverviewDTO {
  environment: SupplierEnvironment;
  configured: boolean;
  settings: PricingSettingsDTO;
  rows: PricingRowDTO[];
  lastSync: PricingLastSyncDTO | null;
}

export interface PricingSyncResultDTO {
  ok: boolean;
  environment: SupplierEnvironment;
  productsSynced: number;
  costsUpserted: number;
  skipped: number;
  error: string | null;
}

export interface PublishPriceResultDTO {
  ok: boolean;
  variantId: string;
  publishedPriceMad: number | null;
  error: string | null;
}

// ─── Reloadly catalog importer (Phase 2) ─────────────────────────────────────

/** How much of a Reloadly product is already present in the Ghost catalog. */
export type ReloadlyImportMappingStatus = "added" | "partial" | "not_added";

export interface ReloadlyImportSearchRowDTO {
  productId: number;
  productName: string;
  brandName: string;
  categoryName: string | null;
  country: string;
  countryName: string;
  flagUrl: string | null;
  logoUrl: string | null;
  recipientCurrency: string;
  denominationType: string;
  fixedDenominations: number[];
  minDenomination: number | null;
  maxDenomination: number | null;
  status: string; // Reloadly ACTIVE/INACTIVE
  mappingStatus: ReloadlyImportMappingStatus;
  mappedFaceValues: number[];
}

export interface ReloadlyImportSearchPageDTO {
  rows: ReloadlyImportSearchRowDTO[];
  page: number;
  totalPages: number;
  totalElements: number;
}

/** Per-denomination cost + suggested-price preview for the import panel. */
export interface ReloadlyDenominationPreviewDTO {
  faceValue: number;
  faceCurrency: string;
  providerCost: number | null;
  supplierCurrency: string | null;
  fxRateToMad: number | null;
  costInMad: number | null;
  marginSource: PricingMarginSource | null;
  marginPct: number | null;
  suggestedPriceMad: number | null;
  expectedProfitMad: number | null;
  expectedMarginPct: number | null;
  /** True when a variant with this (product, faceValue, currency) already exists. */
  alreadyExists: boolean;
  /** For RANGE: whether this face value is within Reloadly's min/max. */
  withinBounds: boolean;
  error: string | null;
}

export interface ReloadlyImportDetailDTO {
  productId: number;
  productName: string;
  brandName: string;
  categoryName: string | null;
  country: string;
  countryName: string;
  flagUrl: string | null;
  logoUrl: string | null;
  recipientCurrency: string;
  senderCurrency: string;
  denominationType: string;
  status: string;
  senderFee: number;
  senderFeePercentage: number;
  discountPercentage: number;
  minDenomination: number | null;
  maxDenomination: number | null;
  redeemInstructionConcise: string | null;
  redeemInstructionVerbose: string | null;
  userIdRequired: boolean;
  costSyncedAt: string | null;
  /** Configurable staleness threshold (days) from pricing settings. */
  costStaleDays: number;
  /** Suggested Ghost-side defaults, all admin-editable. */
  suggestedRegionCode: string;
  suggestedCategoryId: string | null;
  suggestedSlug: string;
  /** FIXED: all offered denominations priced. RANGE: empty (admin defines them). */
  denominations: ReloadlyDenominationPreviewDTO[];
  environment: SupplierEnvironment;
}

export interface ImportReloadlyVariantInput {
  faceValue: number;
  faceCurrency: string;
  publishedPriceMad: number;
  marginPctOverride?: number | null;
  fixedSuggestedPriceMad?: number | null;
  active: boolean;
  /** "reloadly" (API) or "manual". */
  stockControl: string;
}

export interface ImportReloadlyProductInput {
  reloadlyProductId: number;
  reloadlyCountryCode: string;
  // Parent product settings (all admin-controlled)
  name: string;
  slug: string;
  categoryId: string;
  brand: string;
  description: string;
  instructions: string;
  regionCode: string;
  active: boolean;
  featured: boolean;
  /** Optional temporary placeholder image (e.g. the Reloadly logo). */
  imageUrl: string | null;
  variants: ImportReloadlyVariantInput[];
}

export interface ImportReloadlyResultDTO {
  ok: boolean;
  productSlug: string | null;
  productName: string | null;
  createdProduct: boolean;
  createdVariants: number;
  skippedVariants: number;
  skippedFaceValues: number[];
  error: string | null;
}

// ─── Bulk import / grouping / draft workflow ─────────────────────────────────

export type ImportStatus = "draft" | "publish";
export type ImportParentMode = "new" | "existing";

/** A Ghost parent product an import can be grouped into (§5). */
export interface GhostParentOptionDTO {
  slug: string;
  name: string;
  category: string;
  region: string;
  active: boolean;
  variantCount: number;
}

export interface ImportVariantConfigInput {
  faceValue: number;
  faceCurrency: string;
  publishedPriceMad: number;
  marginPctOverride?: number | null;
  fixedSuggestedPriceMad?: number | null;
  stockControl: string; // "reloadly" | "manual"
  /** Admin-only, informational (§7). Never customer-visible / never affects pricing. */
  competitorReferencePriceMad?: number | null;
  competitorReferenceSource?: string | null;
}

/** One Reloadly product contributing variants to a parent group. */
export interface ImportSourceInput {
  reloadlyProductId: number;
  reloadlyCountryCode: string;
  variants: ImportVariantConfigInput[];
}

/** A parent product target — new or an existing Ghost product — plus its sources. */
export interface ImportGroupInput {
  target:
    | {
        mode: "new";
        name: string;
        slug: string;
        categoryId: string;
        brand: string;
        description: string;
        instructions: string;
        regionCode: string;
        featured: boolean;
        imageUrl: string | null;
        /** True when imageUrl is a temporary Reloadly provider logo (§2). */
        imageIsProviderPlaceholder: boolean;
      }
    | { mode: "existing"; slug: string };
  /** For an existing parent: activate the newly added variants (default false, §1). */
  activateNewVariants: boolean;
  sources: ImportSourceInput[];
}

export interface ImportReloadlyBatchInput {
  /** Applies to NEW parents' active state. Existing parents keep their state. */
  status: ImportStatus;
  groups: ImportGroupInput[];
}

export interface ImportedProductSummaryDTO {
  slug: string;
  name: string;
  createdProduct: boolean;
  active: boolean;
  isDraft: boolean;
  createdVariants: number;
  skippedVariants: number;
  skippedFaceValues: number[];
  needsMediaReview: boolean;
  usingProviderPlaceholder: boolean;
}

export interface ImportReloadlyBatchResultDTO {
  ok: boolean;
  error: string | null;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsSkipped: number;
  draftProducts: number;
  publishedProducts: number;
  variantsNeedingMedia: number;
  products: ImportedProductSummaryDTO[];
}
