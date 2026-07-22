/**
 * Internal types for the intelligent CEO Briefing (not the public DTO).
 *
 * The pipeline is: OperationsSnapshotDTO (+ a few extra counts) → a SANITIZED
 * business snapshot (no PII) → deterministic CandidateIssue[] (severity is code,
 * never the model) → the AI reorders/rewords among the candidates and returns an
 * approved action id → the server resolves the id to a real href.
 *
 * None of the modules under this folder import server-only code, so the pure
 * pieces (candidates, actions, fallback, sanitize, hash, validate) run in the
 * client bundle for the instant deterministic view too.
 */

/** Deterministic severity — the AI may never lower a real critical. */
export type IssueSeverity = "critical" | "high" | "medium" | "opportunity" | "healthy";

/** The closed set of issue kinds the deterministic layer can produce. */
export type CandidateType =
  | "SYSTEM_HEALTH"
  | "SUPPLIER_OFFLINE"
  | "SUPPLIER_BALANCE_CRITICAL"
  | "SUPPLIER_BALANCE_LOW"
  | "ORDERS_PAYMENT_ISSUE"
  | "ORDERS_STUCK"
  | "FAILED_PURCHASES"
  | "PAYMENT_PROVIDER_WARNING"
  | "PAYMENT_MISCONFIGURED"
  | "PAYMENT_REVIEW_BACKLOG"
  | "EMAIL_FAILURES"
  | "SUPPORT_BACKLOG"
  | "PRODUCTS_COVERAGE"
  | "LAUNCH_BLOCKER"
  | "GROWTH_OPPORTUNITY"
  | "HEALTHY";

/** The closed set of approved action ids. Resolved to real hrefs server-side. */
export type ActionId =
  | "OPEN_SUPPLIERS"
  | "OPEN_SUPPLIER_DETAIL"
  | "OPEN_PAYMENT_SETTINGS"
  | "OPEN_PAYMENT_REVIEW"
  | "OPEN_ORDERS"
  | "OPEN_ORDER_DETAIL"
  | "OPEN_REFUNDS"
  | "OPEN_SUPPORT"
  | "OPEN_FULFILLMENT_TEST"
  | "OPEN_PRODUCTS"
  | "OPEN_EMAIL_HEALTH"
  | "OPEN_ACTIVITY"
  | "OPEN_OVERVIEW";

/**
 * One deterministic candidate issue. `severity` and the facts are computed in
 * code; the AI only chooses among candidates and rewrites the prose.
 */
export interface CandidateIssue {
  type: CandidateType;
  severity: IssueSeverity;
  /** Factual, human title (used verbatim by the fallback; a hint for the AI). */
  title: string;
  /** Factual description. */
  description: string;
  /** Affected/at-risk count (0 when not applicable). */
  count: number;
  /** Approved actions eligible for this issue (first = preferred primary). */
  allowedActionIds: ActionId[];
  /** Entity params used to resolve dynamic action hrefs, deterministically. */
  supplierSlug?: string;
  orderId?: string;
  /** Small set of safe supporting metrics passed to the AI. */
  metrics?: Record<string, string | number>;
}

/** Extra facts not carried by OperationsSnapshotDTO (kept intentionally small). */
export interface CandidateExtras {
  /** Count of open support tickets (from countOpenSupportTickets). */
  supportOpen: number;
}

/** The sanitized, PII-free payload handed to the AI model. */
export interface BriefingAiPayload {
  generatedAt: string;
  environment: string;
  storeStatus: {
    ordersEnabled: boolean;
    maintenanceEnabled: boolean;
    launchMode: boolean;
    overallStatus: string;
  };
  revenue: { headline: string; trend: string | null };
  orders: {
    pendingPayment: number;
    paymentSubmitted: number;
    awaitingFulfillment: number;
    paymentIssue: number;
    deliveredToday: number;
    waitingTooLong: number;
    recentFailedPurchases: number;
  };
  payments: {
    activeMethods: number;
    misconfiguredMethods: number;
    pendingReviews: number;
    providerWarning: string | null;
  };
  suppliers: {
    name: string;
    status: string;
    balance: number | null;
    currency: string | null;
    recentFailedPurchases: number;
  }[];
  support: { open: number };
  email: { status: string; recentFailures: number };
  catalog: { active: number; coverageIssues: number };
  /** The deterministic candidates the AI must choose among. */
  candidates: {
    type: CandidateType;
    severity: IssueSeverity;
    title: string;
    description: string;
    count: number;
    allowedActionIds: ActionId[];
  }[];
  allowedActionIds: ActionId[];
}

/** The validated AI decision (before the server resolves actions to hrefs). */
export interface AiBriefingDecision {
  state: "critical" | "attention" | "opportunity" | "healthy";
  eyebrow: string | null;
  title: string;
  summary: string;
  context: string | null;
  primaryIssueType: CandidateType;
  primaryActionId: ActionId;
  secondaryActionId: ActionId | null;
  reasoningSummary: string;
  confidence: number;
}
