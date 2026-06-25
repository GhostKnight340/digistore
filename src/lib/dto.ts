import type { OrderStatus } from "./types";

// Plain serializable shapes passed between server (DB) and client components.
// `productId` always refers to the catalog SLUG (e.g. "steam-100").

export interface OrderItemDTO {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceMad: number;
  category: string;
  region: string;
  deliveryType: string;
}

export interface DeliveredCodeDTO {
  productId: string;
  code: string;
}

/** Customer-safe order view — only this order's delivered codes, no inventory. */
export interface CustomerOrderDTO {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  totalMad: number;
  createdAt: string;
  items: OrderItemDTO[];
  deliveredCodes: DeliveredCodeDTO[];
}

export interface EmailLogDTO {
  id: string;
  type: string;
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}

/** Admin order view — adds simulated email logs. */
export interface AdminOrderDTO extends CustomerOrderDTO {
  emailLogs: EmailLogDTO[];
}

export interface AdminCodeDTO {
  id: string;
  code: string;
  status: string;
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

// ─── Product management ───────────────────────────────────────────────────────

export interface VariantDTO {
  id: string;
  slug: string;
  name: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  active: boolean;
  featured: boolean;
  stockControl: string;
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
  createdAt: string;
  variants: VariantDTO[];
}

export interface SaveParentProductInput {
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
}

export interface SaveVariantInput {
  slug: string;
  name: string;
  parentSlug: string;
  category: string;
  priceMad: number;
  faceValue: number | null;
  faceCurrency: string;
  region: string;
  deliveryType: string;
  active: boolean;
  featured: boolean;
  stockControl: string;
}

// ─── Customer summaries ───────────────────────────────────────────────────────

export interface CustomerDTO {
  email: string;
  name: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
}

// ─── Fulfillment ──────────────────────────────────────────────────────────────

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
