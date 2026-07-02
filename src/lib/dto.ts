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
}

export interface DeliveredCodeDTO {
  productId: string;
  orderItemId?: string;
  code: string;
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
  publicOrderNumber: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
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
}

export interface ItemAssignment {
  orderItemId: string;
  codes: AssignmentEntry[];
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ─── Payment settings DTOs ────────────────────────────────────────────────────

export interface BankDTO {
  id: string;
  name: string;
  accountHolder: string;
  accountNumber: string;
  rib: string;
  iban: string;
  swift: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
}

export interface CryptoWalletDTO {
  id: string;
  coin: string;
  network: string;
  address: string;
  label: string;
  instructions: string;
  enabled: boolean;
}

export interface PaymentMethodConfigDTO {
  method: string;
  enabled: boolean;
  proofRequired: boolean;
  paypalEmail: string;
  cardMessage: string;
  instructions: string;
}

export interface SupportConfigDTO {
  id: string;
  whatsappNumber: string;
  supportEmail: string;
  instructions: string;
}

export interface PaymentConfigDTO {
  methods: Record<string, PaymentMethodConfigDTO>;
  banks: BankDTO[];
  wallets: CryptoWalletDTO[];
  support: SupportConfigDTO;
}
