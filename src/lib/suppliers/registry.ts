/**
 * Supplier provider registry — the single seam between Ghost.ma and every
 * fulfillment supplier (Reloadly, FazerCards, future Eneba…).
 *
 * Design contract:
 *  - Static metadata (name, description, capabilities, credential env-var
 *    names) lives HERE, in code. The `Supplier` DB row stores only
 *    operational state (enabled, last success/failure, cached balance).
 *  - Each supplier implements {@link SupplierProvider} in its own file under
 *    ./providers/. Adding a supplier = one provider file + one entry in
 *    {@link SUPPLIER_PROVIDERS}. Nothing else in the app should switch on a
 *    supplier slug — fulfillment, admin actions and UI all go through this
 *    registry.
 *  - No method here may ever expose credentials; testConnection/getBalance
 *    are read-only; purchase() is the ONLY money-spending call and is only
 *    invoked from deliverOrder with an idempotent request.
 */
import "server-only";
import type { DeliveredFieldDTO } from "@/lib/dto";
import { reloadlyProvider } from "./providers/reloadly";
import { fazercardsProvider } from "./providers/fazercards";

export type SupplierSlug = "reloadly" | "fazercards";

export type SupplierConnectionTest = {
  ok: boolean;
  /** Admin-safe French message (success summary or failure reason). */
  message: string;
  /** Wall-clock time of the API round-trip(s). */
  responseTimeMs: number;
  /** Extra read-only facts surfaced by the check (plan, permissions…). */
  details: { label: string; value: string }[];
};

export type SupplierBalance = {
  /** Decimal string as returned by the provider. */
  amount: string;
  currency: string;
};

/**
 * Provider-agnostic purchase request. `entryParams` carries the variant's
 * provider mapping exactly as stored in AssignmentEntry — each provider
 * validates and interprets its own params shape.
 */
export type SupplierPurchaseRequest = {
  /** Stable idempotency scope: `${orderId}-${orderItemId}-${slotIndex}`. */
  idempotencyScope: string;
  entryParams: Record<string, unknown>;
  context: {
    orderId: string;
    customerEmail: string;
    /** Variant denomination, for providers that price by face value. */
    faceValue: number | null;
    faceCurrency: string;
  };
};

export type SupplierPurchaseResult = {
  /** Normalized delivery fields shown on the customer delivery page. */
  fields: DeliveredFieldDTO[];
  /** Compact value stored on DeliveredCode.manualCode for the admin record. */
  primary: string;
  /** Provider-side references persisted on DeliveredCode for audit. */
  providerRefs: {
    reloadlyTransactionId?: number;
    reloadlyOrderId?: number;
    fazercardsOrderId?: string;
  };
  /** Provider order/transaction id as a display string (for logs). */
  providerRef: string;
  /** Optional post-delivery hook (e.g. Reloadly cost reconciliation). Runs
   *  best-effort AFTER the order is delivered; must never throw meaningfully. */
  afterDelivered?: () => void;
};

/** Inputs a provider needs to verify one variant↔product mapping. */
export type SupplierMappingCheckInput = {
  supplierProductId: string;
  supplierCategoryId: string | null;
  supplierKind: string | null;
  supplierRegion: string | null;
  faceValue: number | null;
  faceCurrency: string | null;
};

/**
 * Outcome of a read-only mapping check. `refresh` carries authoritative
 * catalog facts (name, region, cost…) the caller may persist onto the
 * mapping — the provider itself never writes anything.
 */
export type SupplierMappingCheckResult = {
  ok: boolean;
  /** Admin-safe French diagnostic (never a raw provider response). */
  message: string;
  refresh?: {
    supplierProductName?: string;
    supplierRegion?: string;
    faceValue?: number;
    faceCurrency?: string;
    costAmount?: number;
    costCurrency?: string;
  };
};

/**
 * Which credential set / API host a read-only or purchase call targets.
 * OMITTED everywhere on the production money path, so callers default to the
 * provider's own environment (live for Reloadly). ONLY the Fulfillment Test
 * Center passes `"sandbox"` explicitly, to exercise this exact code against the
 * supplier's sandbox without touching live credentials. Providers without
 * environments (FazerCards) ignore the argument.
 */
export type SupplierEnvironment = "sandbox" | "live";

export type SupplierProvider = {
  slug: SupplierSlug;
  name: string;
  description: string;
  /** Accent color for the admin tile (no official logo assets are bundled). */
  accentColor: string;
  /** Short initials rendered in the logo tile. */
  initials: string;
  /** Env-var names backing this supplier's credentials (never the values). */
  credentialEnvVars: string[];
  supportsBalance: boolean;
  /** "sandbox" | "live" for providers with environments, null otherwise. */
  environment(): "sandbox" | "live" | null;
  isConfigured(environment?: SupplierEnvironment): boolean;
  /** Read-only auth + availability check. MUST never place an order. */
  testConnection(environment?: SupplierEnvironment): Promise<SupplierConnectionTest>;
  /** Read-only wallet balance. Only present when supportsBalance. */
  getBalance?(environment?: SupplierEnvironment): Promise<SupplierBalance>;
  /** Read-only catalog check that a mapping points at a real, compatible,
   *  available supplier product. MUST never place an order. */
  validateMapping(
    input: SupplierMappingCheckInput,
    environment?: SupplierEnvironment,
  ): Promise<SupplierMappingCheckResult>;
  /** Places ONE real order (idempotent per idempotencyScope) and returns the
   *  normalized delivery payload. Throws a safe-to-display Error on failure. */
  purchase(
    request: SupplierPurchaseRequest,
    environment?: SupplierEnvironment,
  ): Promise<SupplierPurchaseResult>;
};

export const SUPPLIER_PROVIDERS: Record<SupplierSlug, SupplierProvider> = {
  reloadly: reloadlyProvider,
  fazercards: fazercardsProvider,
};

export const SUPPLIER_SLUGS = Object.keys(SUPPLIER_PROVIDERS) as SupplierSlug[];

export function isSupplierSlug(value: string): value is SupplierSlug {
  return value in SUPPLIER_PROVIDERS;
}

export function getSupplierProvider(slug: SupplierSlug): SupplierProvider {
  return SUPPLIER_PROVIDERS[slug];
}
