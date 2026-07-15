/**
 * Serializable DTOs for the admin Customer Management area. Pure types (no DB,
 * no server-only) so server loaders and client components share one shape.
 * Sensitive values are masked at the DB layer before they reach these DTOs.
 */

export const CUSTOMER_STATUSES = ["active", "disabled", "review", "fraud_hold"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export type CustomerListSort =
  | "newest"
  | "oldest"
  | "most_orders"
  | "highest_spend"
  | "recent_activity";

export interface CustomerListFilters {
  query?: string;
  status?: CustomerStatus | "";
  verified?: "verified" | "unverified" | "";
  orders?: "has" | "none" | "";
  ghostCredit?: "has" | "";
  openSupport?: "has" | "";
  sort?: CustomerListSort;
  page?: number;
}

/** One row in the /admin/clients list. */
export interface AdminCustomerListItemDTO {
  id: string;
  name: string;
  email: string;
  /** Masked for list display. */
  phoneMasked: string;
  emailVerified: boolean;
  status: CustomerStatus;
  signupMethod: string;
  createdAt: string;
  lastActivityAt: string | null;
  orderCount: number;
  /** Completed customer spend (payment_confirmed/delivered), never called profit. */
  completedSpendMad: number;
  ghostCreditBalanceMad: number;
  openSupportCount: number;
  walletFrozen: boolean;
}

export interface AdminCustomerListResult {
  items: AdminCustomerListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerOverviewDTO {
  identity: {
    id: string;
    name: string;
    email: string;
    /** Masked; full value only revealed on explicit reveal via a guarded action. */
    phoneMasked: string;
    hasPhone: boolean;
    emailVerified: boolean;
    signupMethod: string;
    preferredLanguage: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    status: CustomerStatus;
    statusReason: string | null;
    marketingConsent: boolean;
  };
  commerce: {
    completedOrders: number;
    pendingOrders: number;
    cancelledOrRefundedOrders: number;
    completedSpendMad: number;
    averageOrderValueMad: number;
    lastOrderAt: string | null;
    topCategories: { name: string; count: number }[];
    topProducts: { name: string; count: number }[];
  };
  wallet: {
    availableMad: number;
    lockedMad: number;
    pendingMad: number;
    expiresAt: string | null;
    lastQualifyingCreditAt: string | null;
    frozen: boolean;
    frozenReason: string | null;
  };
  support: {
    openTickets: number;
    lastInteractionAt: string | null;
    unresolvedOrderIssues: number;
  };
}

export interface CustomerOrderRowDTO {
  id: string;
  publicOrderNumber: string;
  createdAt: string;
  itemsSummary: string;
  totalMad: number;
  discountMad: number;
  ghostCreditAppliedMad: number;
  externalPaidMad: number;
  paymentMethod: string;
  status: string;
  hasProblem: boolean;
}

export interface CustomerPaymentRowDTO {
  orderId: string;
  publicOrderNumber: string;
  paymentMethod: string;
  amountDueMad: number;
  amountReceivedMad: number | null;
  currency: string;
  hasProof: boolean;
  /** Masked provider/capture reference, or "". */
  providerReferenceMasked: string;
  verificationState: string;
  status: string;
  createdAt: string;
}

/** A Ghost-Credit reservation locked by a specific pending order. */
export interface CustomerLockedCreditDTO {
  orderId: string;
  publicOrderNumber: string;
  amountMad: number;
  status: string;
  createdAt: string;
  autoExpiresAt: string | null;
}

export interface CustomerPromotionsDTO {
  promos: {
    code: string;
    rewardType: string;
    orderNumber: string | null;
    amountMad: number;
    status: string;
    reversed: boolean;
    createdAt: string;
  }[];
  milestones: {
    qualifyingSpendMad: number;
    unlocked: {
      title: string;
      thresholdMad: number;
      rewardMad: number;
      status: string;
      grantedAt: string;
    }[];
    next: { title: string; thresholdMad: number; remainingMad: number } | null;
  };
}

export interface CustomerSupportTicketDTO {
  id: string;
  reference: string;
  category: string;
  subIssueLabel: string;
  orderRef: string | null;
  status: string;
  resolution: string | null;
  latestMessage: string;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSecurityDTO {
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  providers: string[];
  googleLinked: boolean;
  discordLinked: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  lastPasswordChangeAt: string | null;
  sessionsValidAfter: string | null;
  status: CustomerStatus;
  marketingConsent: boolean;
  /** Recent login/security-relevant events, masked. Bounded. */
  recentEvents: { label: string; at: string }[];
}
