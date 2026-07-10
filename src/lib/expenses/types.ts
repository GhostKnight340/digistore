/**
 * DTOs returned by the expense DB layer / server actions to the admin panel.
 * Money is surfaced as plain numbers (converted from Prisma Decimal at the DB
 * boundary) and dates as ISO strings, matching the rest of the admin DTOs.
 */

export type ExpenseEntryDTO = {
  id: string;
  recurringExpenseId: string | null;
  name: string;
  category: string;
  type: string;
  amountOriginal: number | null;
  currency: string;
  amountEstimated: boolean;
  exchangeRateToMad: number | null;
  amountMad: number | null;
  status: string;
  dueDate: string | null;
  occurrenceDate: string | null;
  paidDate: string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  paidExchangeRate: number | null;
  paymentReference: string | null;
  paymentAccount: string | null;
  invoiceReference: string | null;
  hasReceipt: boolean;
  receiptFileName: string | null;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Frequency of the parent subscription (when recurring), for the ledger row.
  frequency: string | null;
};

export type RecurringExpenseDTO = {
  id: string;
  name: string;
  description: string;
  category: string;
  currency: string;
  amount: number | null;
  amountMad: number | null;
  isUsageBased: boolean;
  frequency: string;
  customIntervalDays: number | null;
  nextBillingDate: string;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean;
  paymentAccount: string | null;
  notes: string | null;
  reminderDaysBefore: number[];
  remindOnDue: boolean;
  remindOverdue: boolean;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // The effective status for the *next* occurrence (upcoming/overdue) for the
  // ledger's status column when the subscription is active.
  occurrenceStatus: string;
  lastPaymentDate: string | null;
  // Set when the subscription was dropped/expired.
  terminationType: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
};

/** A row in the ledger table: either a standalone ExpenseEntry or the virtual
 *  "next occurrence" of an active RecurringExpense. */
export type LedgerRowDTO = {
  key: string;
  kind: "recurring" | "entry";
  recurringExpenseId: string | null;
  entryId: string | null;
  name: string;
  category: string;
  type: string;
  amountOriginal: number | null;
  currency: string;
  amountEstimated: boolean;
  amountMad: number | null;
  frequency: string | null;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  status: string;
  paymentAccount: string | null;
  notes: string | null;
};

export type ExpenseSummaryDTO = {
  monthMad: number;
  yearMad: number;
  upcomingCount: number;
  upcomingMad: number;
  unconfirmedVariableCount: number;
  unconfirmedVariableMad: number;
  reportingCurrency: string;
};

export type UpcomingPaymentDTO = {
  key: string;
  recurringExpenseId: string | null;
  entryId: string | null;
  name: string;
  category: string;
  amountOriginal: number | null;
  currency: string;
  amountMad: number | null;
  amountEstimated: boolean;
  frequency: string | null;
  dueDate: string;
  status: string; // "upcoming" | "overdue"
  isRecurring: boolean;
};

export type UpcomingPaymentsDTO = {
  today: UpcomingPaymentDTO[];
  next7Days: UpcomingPaymentDTO[];
  laterThisMonth: UpcomingPaymentDTO[];
  nextMonth: UpcomingPaymentDTO[];
};

export type ExpenseAdjustmentDTO = {
  id: string;
  kind: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ExpenseNotificationDTO = {
  id: string;
  kind: string;
  channel: string;
  status: string;
  error: string | null;
  discordMessageId: string | null;
  occurrenceDate: string | null;
  createdAt: string;
};

export type ExpenseDetailDTO = {
  recurring: RecurringExpenseDTO | null;
  entry: ExpenseEntryDTO | null;
  occurrences: ExpenseEntryDTO[];
  adjustments: ExpenseAdjustmentDTO[];
  notifications: ExpenseNotificationDTO[];
};

/** One end-of-month review's send + acknowledgement state, for the admin history. */
export type MonthlyReviewDTO = {
  id: string;
  monthKey: string; // "YYYY-MM"
  status: string; // "pending" | "sending" | "sent" | "failed"
  attemptCount: number;
  discordMessageId: string | null;
  error: string | null;
  sentAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFilters = {
  view?: string; // "all" | "upcoming" | "paid" | "overdue" | "recurring" | "one_time" | "variable" | "cancelled"
  category?: string;
  provider?: string;
  currency?: string;
  status?: string;
  from?: string;
  to?: string;
};
