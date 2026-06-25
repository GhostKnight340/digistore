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
  recipient: string;
  subject: string;
  body: string;
  createdAt: string;
}

/** Admin order view — adds simulated email logs. */
export interface AdminOrderDTO extends CustomerOrderDTO {
  emailLogs: EmailLogDTO[];
  proofMimeType: string | null;
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
