import "server-only";

import { prisma } from "./prisma";
import { getPricingSettings } from "./pricing-settings";
import { mergeStoreSettings, type StoreSettings } from "@/lib/storeSettings";
import { convertToMad, nextBillingDate } from "@/lib/expenses/currency";
import type {
  ExpenseEntryDTO,
  RecurringExpenseDTO,
  LedgerRowDTO,
  ExpenseSummaryDTO,
  UpcomingPaymentsDTO,
  UpcomingPaymentDTO,
  ExpenseDetailDTO,
  ExpenseFilters,
} from "@/lib/expenses/types";
import { Prisma } from "@prisma/client";
import {
  NOT_DEBITED_STATUSES,
  type TerminationType,
} from "@/lib/expenses/constants";
import type { ReviewItem, ReviewRanges } from "@/lib/expenses/monthlyReview";
import type { MonthlyReviewDTO } from "@/lib/expenses/types";

// ── Small helpers ────────────────────────────────────────────────────────────

const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d));
const iso = (d: Date | null): string | null => (d == null ? null : d.toISOString());

async function fxRates(): Promise<Record<string, number>> {
  const settings = await getPricingSettings();
  return settings.fxRatesToMad;
}

async function loadSettings(): Promise<StoreSettings> {
  const record = await prisma.storeSetting.findUnique({ where: { id: "default" } });
  return mergeStoreSettings(record?.value);
}

export async function getExpenseConfig(): Promise<StoreSettings["expenses"]> {
  return (await loadSettings()).expenses;
}

function startOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfNextMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
function startOfYear(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}
function endOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
}

// ── DTO mappers ──────────────────────────────────────────────────────────────

function toEntryDTO(
  e: Prisma.ExpenseEntryGetPayload<object>,
  frequency: string | null = null,
): ExpenseEntryDTO {
  return {
    id: e.id,
    recurringExpenseId: e.recurringExpenseId,
    name: e.name,
    category: e.category,
    type: e.type,
    amountOriginal: num(e.amountOriginal),
    currency: e.currency,
    amountEstimated: e.amountEstimated,
    exchangeRateToMad: num(e.exchangeRateToMad),
    amountMad: num(e.amountMad),
    status: e.status,
    dueDate: iso(e.dueDate),
    occurrenceDate: iso(e.occurrenceDate),
    paidDate: iso(e.paidDate),
    paidAmount: num(e.paidAmount),
    paidCurrency: e.paidCurrency,
    paidExchangeRate: num(e.paidExchangeRate),
    paymentReference: e.paymentReference,
    paymentAccount: e.paymentAccount,
    invoiceReference: e.invoiceReference,
    hasReceipt: Boolean(e.receiptData),
    receiptFileName: e.receiptFileName,
    notes: e.notes,
    createdBy: e.createdBy,
    updatedBy: e.updatedBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    frequency,
  };
}

type RecurringWithOccurrences = Prisma.RecurringExpenseGetPayload<{
  include: { occurrences: true };
}>;

/** The status of a recurring subscription's *next* occurrence for the ledger.
 *  A terminated subscription shows its termination outcome, not a payment state.
 *  A passed due date is "overdue" (À confirmer / En retard) — NEVER auto-paid. */
function occurrenceStatus(r: { status: string; nextBillingDate: Date; terminationType: string | null }): string {
  if (r.status === "cancelled") {
    return r.terminationType === "expired" ? "subscription_expired" : "subscription_cancelled";
  }
  if (r.status === "paused") return "pending";
  return r.nextBillingDate.getTime() < Date.now() ? "overdue" : "upcoming";
}

function toRecurringDTO(r: RecurringWithOccurrences, fx: Record<string, number>): RecurringExpenseDTO {
  const paid = r.occurrences
    .filter((o) => o.status === "paid" && o.paidDate)
    .sort((a, b) => (b.paidDate!.getTime() - a.paidDate!.getTime()));
  const { amountMad } = convertToMad(num(r.amount), r.currency, fx);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    currency: r.currency,
    amount: num(r.amount),
    amountMad,
    isUsageBased: r.isUsageBased,
    frequency: r.frequency,
    customIntervalDays: r.customIntervalDays,
    nextBillingDate: r.nextBillingDate.toISOString(),
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    autoRenew: r.autoRenew,
    paymentAccount: r.paymentAccount,
    notes: r.notes,
    reminderDaysBefore: r.reminderDaysBefore,
    remindOnDue: r.remindOnDue,
    remindOverdue: r.remindOverdue,
    status: r.status,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    occurrenceStatus: occurrenceStatus(r),
    lastPaymentDate: paid[0]?.paidDate?.toISOString() ?? null,
    terminationType: r.terminationType,
    terminatedAt: iso(r.terminatedAt),
    terminationReason: r.terminationReason,
  };
}

// ── Ledger ───────────────────────────────────────────────────────────────────

/** Rows for the ledger table: one per RecurringExpense (its next occurrence) +
 *  standalone ExpenseEntries. Paid recurring occurrences live in the detail
 *  history, except the "paid" view which surfaces every paid entry. */
export async function listLedger(filters: ExpenseFilters = {}): Promise<LedgerRowDTO[]> {
  const fx = await fxRates();
  const [recurrings, entries] = await Promise.all([
    prisma.recurringExpense.findMany({
      include: { occurrences: true },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.expenseEntry.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const rows: LedgerRowDTO[] = [];

  for (const r of recurrings) {
    const dto = toRecurringDTO(r, fx);
    rows.push({
      key: `recur:${r.id}`,
      kind: "recurring",
      recurringExpenseId: r.id,
      entryId: null,
      name: dto.name,
      category: dto.category,
      type: dto.isUsageBased ? "usage_based" : "recurring",
      amountOriginal: dto.amount,
      currency: dto.currency,
      amountEstimated: dto.isUsageBased && dto.amount == null,
      amountMad: dto.amountMad,
      frequency: dto.frequency,
      nextPaymentDate: dto.status === "cancelled" ? null : dto.nextBillingDate,
      lastPaymentDate: dto.lastPaymentDate,
      status: dto.occurrenceStatus,
      paymentAccount: dto.paymentAccount,
      notes: dto.notes,
    });
  }

  const showPaidView = filters.view === "paid";
  for (const e of entries) {
    // Standalone entries always show; paid recurring occurrences only in the paid view.
    if (e.recurringExpenseId && !(showPaidView && e.status === "paid")) continue;
    rows.push({
      key: `entry:${e.id}`,
      kind: "entry",
      recurringExpenseId: e.recurringExpenseId,
      entryId: e.id,
      name: e.name,
      category: e.category,
      type: e.type,
      amountOriginal: num(e.amountOriginal),
      currency: e.currency,
      amountEstimated: e.amountEstimated,
      amountMad: num(e.amountMad),
      frequency: null,
      nextPaymentDate: iso(e.dueDate),
      lastPaymentDate: iso(e.paidDate),
      status: e.status,
      paymentAccount: e.paymentAccount,
      notes: e.notes,
    });
  }

  return applyFilters(rows, filters);
}

function applyFilters(rows: LedgerRowDTO[], f: ExpenseFilters): LedgerRowDTO[] {
  const fromT = f.from ? new Date(f.from).getTime() : null;
  const toT = f.to ? new Date(f.to).getTime() : null;
  return rows.filter((r) => {
    switch (f.view) {
      case "upcoming":
        if (r.status !== "upcoming" && r.status !== "pending") return false;
        break;
      case "overdue":
        if (r.status !== "overdue") return false;
        break;
      case "paid":
        if (r.status !== "paid") return false;
        break;
      case "cancelled":
        if (r.status !== "cancelled") return false;
        break;
      case "recurring":
        if (r.kind !== "recurring" || r.type === "usage_based") return false;
        break;
      case "one_time":
        if (r.type !== "one_time") return false;
        break;
      case "variable":
        if (r.type !== "usage_based") return false;
        break;
    }
    if (f.category && r.category !== f.category) return false;
    if (f.currency && r.currency.toUpperCase() !== f.currency.toUpperCase()) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.provider && !r.name.toLowerCase().includes(f.provider.toLowerCase())) return false;
    if (fromT != null || toT != null) {
      const ref = r.nextPaymentDate ?? r.lastPaymentDate;
      const t = ref ? new Date(ref).getTime() : null;
      if (t == null) return false;
      if (fromT != null && t < fromT) return false;
      if (toT != null && t > toT) return false;
    }
    return true;
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

export async function getSummary(): Promise<ExpenseSummaryDTO> {
  const fx = await fxRates();
  const config = await getExpenseConfig();
  const now = new Date();
  const [paidThisMonth, paidThisYear, activeRecurrings, upcomingEntries, variableEntries] =
    await Promise.all([
      prisma.expenseEntry.findMany({
        where: { status: "paid", paidDate: { gte: startOfMonth(now), lt: startOfNextMonth(now) } },
        select: { amountMad: true },
      }),
      prisma.expenseEntry.findMany({
        where: { status: "paid", paidDate: { gte: startOfYear(now) } },
        select: { amountMad: true },
      }),
      prisma.recurringExpense.findMany({ where: { status: "active" } }),
      prisma.expenseEntry.findMany({
        where: { status: { in: ["upcoming", "pending", "overdue"] } },
        select: { amountMad: true, amountOriginal: true, currency: true },
      }),
      prisma.expenseEntry.findMany({
        where: { type: "usage_based", amountEstimated: true },
        select: { amountMad: true, amountOriginal: true, currency: true },
      }),
    ]);

  const sumMad = (rows: { amountMad: Prisma.Decimal | null }[]) =>
    rows.reduce((s, r) => s + (num(r.amountMad) ?? 0), 0);
  const liveMad = (rows: { amountOriginal: Prisma.Decimal | null; currency: string }[]) =>
    rows.reduce((s, r) => s + (convertToMad(num(r.amountOriginal), r.currency, fx).amountMad ?? 0), 0);

  // Upcoming = active recurring next occurrences + upcoming standalone entries.
  const upcomingRecurringMad = activeRecurrings.reduce(
    (s, r) => s + (convertToMad(num(r.amount), r.currency, fx).amountMad ?? 0),
    0,
  );

  return {
    monthMad: sumMad(paidThisMonth),
    yearMad: sumMad(paidThisYear),
    upcomingCount: activeRecurrings.length + upcomingEntries.length,
    upcomingMad: upcomingRecurringMad + liveMad(upcomingEntries),
    unconfirmedVariableCount:
      variableEntries.length + activeRecurrings.filter((r) => r.isUsageBased && r.amount == null).length,
    unconfirmedVariableMad: liveMad(variableEntries),
    reportingCurrency: config.reportingCurrency,
  };
}

// ── Upcoming payments (grouped) ──────────────────────────────────────────────

export async function getUpcomingPayments(): Promise<UpcomingPaymentsDTO> {
  const fx = await fxRates();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in7 = new Date(todayStart.getTime() + 7 * 86400000);
  const monthEnd = endOfMonth(now);
  const nextMonthStart = startOfNextMonth(now);
  const nextMonthEnd = endOfMonth(nextMonthStart);

  const [recurrings, entries] = await Promise.all([
    prisma.recurringExpense.findMany({ where: { status: "active" } }),
    prisma.expenseEntry.findMany({
      where: { status: { in: ["upcoming", "pending", "overdue"] }, dueDate: { not: null } },
    }),
  ]);

  const items: UpcomingPaymentDTO[] = [];
  for (const r of recurrings) {
    const due = r.nextBillingDate;
    const overdue = due.getTime() < todayStart.getTime();
    items.push({
      key: `recur:${r.id}`,
      recurringExpenseId: r.id,
      entryId: null,
      name: r.name,
      category: r.category,
      amountOriginal: num(r.amount),
      currency: r.currency,
      amountMad: convertToMad(num(r.amount), r.currency, fx).amountMad,
      amountEstimated: r.isUsageBased && r.amount == null,
      frequency: r.frequency,
      dueDate: due.toISOString(),
      status: overdue ? "overdue" : "upcoming",
      isRecurring: true,
    });
  }
  for (const e of entries) {
    const due = e.dueDate!;
    const overdue = due.getTime() < todayStart.getTime();
    items.push({
      key: `entry:${e.id}`,
      recurringExpenseId: e.recurringExpenseId,
      entryId: e.id,
      name: e.name,
      category: e.category,
      amountOriginal: num(e.amountOriginal),
      currency: e.currency,
      amountMad: num(e.amountMad) ?? convertToMad(num(e.amountOriginal), e.currency, fx).amountMad,
      amountEstimated: e.amountEstimated,
      frequency: null,
      dueDate: due.toISOString(),
      status: overdue ? "overdue" : "upcoming",
      isRecurring: false,
    });
  }

  const grouped: UpcomingPaymentsDTO = { today: [], next7Days: [], laterThisMonth: [], nextMonth: [] };
  for (const it of items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const t = new Date(it.dueDate).getTime();
    if (t < todayStart.getTime() || (t >= todayStart.getTime() && t < todayStart.getTime() + 86400000)) {
      grouped.today.push(it);
    } else if (t < in7.getTime()) {
      grouped.next7Days.push(it);
    } else if (t <= monthEnd.getTime()) {
      grouped.laterThisMonth.push(it);
    } else if (t >= nextMonthStart.getTime() && t <= nextMonthEnd.getTime()) {
      grouped.nextMonth.push(it);
    }
  }
  return grouped;
}

// ── Detail ───────────────────────────────────────────────────────────────────

export async function getDetail(input: {
  recurringId?: string;
  entryId?: string;
}): Promise<ExpenseDetailDTO | null> {
  const fx = await fxRates();
  if (input.recurringId) {
    const r = await prisma.recurringExpense.findUnique({
      where: { id: input.recurringId },
      include: { occurrences: { orderBy: { createdAt: "desc" } }, notifications: { orderBy: { createdAt: "desc" } } },
    });
    if (!r) return null;
    const occIds = r.occurrences.map((o) => o.id);
    const adjustments = occIds.length
      ? await prisma.expenseAdjustment.findMany({ where: { expenseEntryId: { in: occIds } }, orderBy: { createdAt: "desc" } })
      : [];
    return {
      recurring: toRecurringDTO(r, fx),
      entry: null,
      occurrences: r.occurrences.map((o) => toEntryDTO(o, r.frequency)),
      adjustments: adjustments.map(toAdjustmentDTO),
      notifications: r.notifications.map(toNotificationDTO),
    };
  }
  if (input.entryId) {
    const e = await prisma.expenseEntry.findUnique({
      where: { id: input.entryId },
      include: { adjustments: { orderBy: { createdAt: "desc" } }, notifications: { orderBy: { createdAt: "desc" } } },
    });
    if (!e) return null;
    return {
      recurring: null,
      entry: toEntryDTO(e),
      occurrences: [],
      adjustments: e.adjustments.map(toAdjustmentDTO),
      notifications: e.notifications.map(toNotificationDTO),
    };
  }
  return null;
}

function toAdjustmentDTO(a: Prisma.ExpenseAdjustmentGetPayload<object>) {
  return {
    id: a.id,
    kind: a.kind,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    reason: a.reason,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}
function toNotificationDTO(n: Prisma.ExpenseNotificationLogGetPayload<object>) {
  return {
    id: n.id,
    kind: n.kind,
    channel: n.channel,
    status: n.status,
    error: n.error,
    discordMessageId: n.discordMessageId,
    occurrenceDate: iso(n.occurrenceDate),
    createdAt: n.createdAt.toISOString(),
  };
}

export async function getReceipt(entryId: string) {
  return prisma.expenseEntry.findUnique({
    where: { id: entryId },
    select: { receiptFileName: true, receiptMimeType: true, receiptData: true },
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export type RecurringInput = {
  name: string;
  description?: string;
  category: string;
  currency: string;
  amount: number | null;
  isUsageBased: boolean;
  frequency: string;
  customIntervalDays?: number | null;
  nextBillingDate: string;
  startDate?: string | null;
  endDate?: string | null;
  autoRenew: boolean;
  paymentAccount?: string | null;
  notes?: string | null;
  reminderDaysBefore: number[];
  remindOnDue: boolean;
  remindOverdue: boolean;
  status?: string;
};

export async function createRecurring(input: RecurringInput, actor: string | null) {
  return prisma.recurringExpense.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? "",
      category: input.category,
      currency: input.currency,
      amount: input.amount,
      isUsageBased: input.isUsageBased,
      frequency: input.frequency,
      customIntervalDays: input.customIntervalDays ?? null,
      nextBillingDate: new Date(input.nextBillingDate),
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      autoRenew: input.autoRenew,
      paymentAccount: input.paymentAccount ?? null,
      notes: input.notes ?? null,
      reminderDaysBefore: input.reminderDaysBefore,
      remindOnDue: input.remindOnDue,
      remindOverdue: input.remindOverdue,
      status: input.status ?? "active",
      createdBy: actor,
    },
  });
}

export type OneTimeInput = {
  name: string;
  category: string;
  type: string; // "one_time" | "usage_based" | "credit"
  amount: number | null;
  currency: string;
  amountEstimated?: boolean;
  dueDate?: string | null;
  status: string;
  paymentAccount?: string | null;
  invoiceReference?: string | null;
  notes?: string | null;
  receipt?: { fileName: string; mimeType: string; dataBase64: string } | null;
};

export async function createOneTime(input: OneTimeInput, actor: string | null) {
  const fx = await fxRates();
  const { amountMad, rate } = convertToMad(input.amount, input.currency, fx);
  return prisma.expenseEntry.create({
    data: {
      recurringExpenseId: null,
      name: input.name.trim(),
      category: input.category,
      type: input.type,
      amountOriginal: input.amount,
      currency: input.currency,
      amountEstimated: input.amountEstimated ?? false,
      exchangeRateToMad: rate,
      amountMad,
      status: input.status,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      occurrenceDate: input.dueDate ? new Date(input.dueDate) : null,
      paymentAccount: input.paymentAccount ?? null,
      invoiceReference: input.invoiceReference ?? null,
      notes: input.notes ?? null,
      receiptFileName: input.receipt?.fileName ?? null,
      receiptMimeType: input.receipt?.mimeType ?? null,
      receiptData: input.receipt?.dataBase64 ?? null,
      createdBy: actor,
    },
  });
}

export async function updateRecurring(id: string, input: Partial<RecurringInput>, actor: string | null) {
  const data: Prisma.RecurringExpenseUpdateInput = {};
  if (input.name != null) data.name = input.name.trim();
  if (input.description != null) data.description = input.description;
  if (input.category != null) data.category = input.category;
  if (input.currency != null) data.currency = input.currency;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.isUsageBased != null) data.isUsageBased = input.isUsageBased;
  if (input.frequency != null) data.frequency = input.frequency;
  if (input.customIntervalDays !== undefined) data.customIntervalDays = input.customIntervalDays;
  if (input.nextBillingDate != null) data.nextBillingDate = new Date(input.nextBillingDate);
  if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null;
  if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.autoRenew != null) data.autoRenew = input.autoRenew;
  if (input.paymentAccount !== undefined) data.paymentAccount = input.paymentAccount;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.reminderDaysBefore != null) data.reminderDaysBefore = input.reminderDaysBefore;
  if (input.remindOnDue != null) data.remindOnDue = input.remindOnDue;
  if (input.remindOverdue != null) data.remindOverdue = input.remindOverdue;
  if (input.status != null) data.status = input.status;
  return prisma.recurringExpense.update({ where: { id }, data });
}

/** Edit an ExpenseEntry. When the entry is already paid, every changed field is
 *  recorded as an append-only ExpenseAdjustment (previous value preserved). */
export async function updateEntry(
  id: string,
  input: Partial<OneTimeInput> & { amount?: number | null },
  actor: string | null,
) {
  const before = await prisma.expenseEntry.findUnique({ where: { id } });
  if (!before) throw new Error("Dépense introuvable.");
  const fx = await fxRates();

  const data: Prisma.ExpenseEntryUpdateInput = { updatedBy: actor };
  const audits: { field: string; oldValue: unknown; newValue: unknown }[] = [];
  const track = (field: string, oldV: unknown, newV: unknown) => {
    if (before.status === "paid" && oldV !== newV) audits.push({ field, oldValue: oldV, newValue: newV });
  };

  if (input.name != null) { track("name", before.name, input.name); data.name = input.name.trim(); }
  if (input.category != null) { track("category", before.category, input.category); data.category = input.category; }
  if (input.notes !== undefined) { data.notes = input.notes; }
  if (input.paymentAccount !== undefined) data.paymentAccount = input.paymentAccount;
  if (input.invoiceReference !== undefined) data.invoiceReference = input.invoiceReference;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.status != null) { track("status", before.status, input.status); data.status = input.status; }
  if (input.amount !== undefined) {
    const { amountMad, rate } = convertToMad(input.amount, input.currency ?? before.currency, fx);
    track("amountOriginal", num(before.amountOriginal), input.amount);
    data.amountOriginal = input.amount;
    data.exchangeRateToMad = rate;
    data.amountMad = amountMad;
    if (input.currency) data.currency = input.currency;
  }

  const updated = await prisma.expenseEntry.update({ where: { id }, data });
  if (audits.length) {
    await prisma.expenseAdjustment.createMany({
      data: audits.map((a) => ({
        expenseEntryId: id,
        kind: "edit",
        field: a.field,
        oldValue: a.oldValue == null ? Prisma.DbNull : (a.oldValue as Prisma.InputJsonValue),
        newValue: a.newValue == null ? Prisma.DbNull : (a.newValue as Prisma.InputJsonValue),
        createdBy: actor,
      })),
    });
  }
  return updated;
}

export type PaidInfo = {
  paidDate: string;
  paidAmount: number;
  paidCurrency: string;
  paymentReference?: string | null;
  note?: string | null;
};

/** Mark a recurring subscription's current occurrence paid: writes a NEW
 *  immutable ExpenseEntry (historical) and advances nextBillingDate. Never
 *  overwrites prior occurrences. */
export async function markRecurringOccurrencePaid(
  recurringId: string,
  paid: PaidInfo,
  actor: string | null,
) {
  const fx = await fxRates();
  const r = await prisma.recurringExpense.findUnique({ where: { id: recurringId } });
  if (!r) throw new Error("Abonnement introuvable.");
  if (r.status === "cancelled") throw new Error("Abonnement résilié — réactivez-le d'abord.");
  const { amountMad, rate } = convertToMad(paid.paidAmount, paid.paidCurrency, fx);
  const occurrenceDate = r.nextBillingDate;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.expenseEntry.create({
      data: {
        recurringExpenseId: r.id,
        name: r.name,
        category: r.category,
        type: r.isUsageBased ? "usage_based" : "recurring",
        amountOriginal: paid.paidAmount,
        currency: paid.paidCurrency,
        amountEstimated: false,
        exchangeRateToMad: rate,
        amountMad,
        status: "paid",
        occurrenceDate,
        dueDate: occurrenceDate,
        paidDate: new Date(paid.paidDate),
        paidAmount: paid.paidAmount,
        paidCurrency: paid.paidCurrency,
        paidExchangeRate: rate,
        paymentReference: paid.paymentReference ?? null,
        paymentAccount: r.paymentAccount,
        notes: paid.note ?? null,
        createdBy: actor,
      },
    });
    const next = nextBillingDate(occurrenceDate, r.frequency, r.customIntervalDays);
    const ended = r.endDate && next.getTime() > r.endDate.getTime();
    await tx.recurringExpense.update({
      where: { id: r.id },
      data: {
        nextBillingDate: next,
        status: ended || !r.autoRenew ? (ended ? "cancelled" : r.status) : r.status,
      },
    });
    return entry;
  });
}

/** Mark a standalone ExpenseEntry (one-time / usage / credit) paid. */
export async function markEntryPaid(entryId: string, paid: PaidInfo, actor: string | null) {
  const fx = await fxRates();
  const { amountMad, rate } = convertToMad(paid.paidAmount, paid.paidCurrency, fx);
  return prisma.expenseEntry.update({
    where: { id: entryId },
    data: {
      status: "paid",
      amountEstimated: false,
      amountOriginal: paid.paidAmount,
      currency: paid.paidCurrency,
      exchangeRateToMad: rate,
      amountMad,
      paidDate: new Date(paid.paidDate),
      paidAmount: paid.paidAmount,
      paidCurrency: paid.paidCurrency,
      paidExchangeRate: rate,
      paymentReference: paid.paymentReference ?? null,
      notes: paid.note ?? undefined,
      updatedBy: actor,
    },
  });
}

/** Replace a usage-based estimate with the confirmed final amount. */
export async function confirmUsageAmount(
  entryId: string,
  finalAmount: number,
  finalCurrency: string,
  actor: string | null,
) {
  const fx = await fxRates();
  const { amountMad, rate } = convertToMad(finalAmount, finalCurrency, fx);
  return prisma.expenseEntry.update({
    where: { id: entryId },
    data: {
      amountOriginal: finalAmount,
      currency: finalCurrency,
      amountEstimated: false,
      exchangeRateToMad: rate,
      amountMad,
      status: "pending",
      updatedBy: actor,
    },
  });
}

/** Skip the current occurrence — advance the schedule WITHOUT creating a paid
 *  entry. The subscription itself stays intact. */
export async function skipOccurrence(recurringId: string) {
  const r = await prisma.recurringExpense.findUnique({ where: { id: recurringId } });
  if (!r) throw new Error("Abonnement introuvable.");
  const next = nextBillingDate(r.nextBillingDate, r.frequency, r.customIntervalDays);
  return prisma.recurringExpense.update({ where: { id: recurringId }, data: { nextBillingDate: next } });
}

export async function setRecurringStatus(recurringId: string, status: "active" | "paused" | "cancelled") {
  // Reactivating clears any termination so it re-enters projections/reminders.
  return prisma.recurringExpense.update({
    where: { id: recurringId },
    data: status === "active"
      ? { status, terminationType: null, terminatedAt: null, terminationReason: null }
      : { status },
  });
}

// ── Correction + subscription drop ───────────────────────────────────────────

export type OccurrenceCorrection = {
  status: string;
  paidDate?: string | null;
  paidAmount?: number | null;
  paidCurrency?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  // false → the subscription did NOT continue after this occurrence (terminate).
  subscriptionContinued?: boolean;
};

function isNotDebited(status: string): boolean {
  return (NOT_DEBITED_STATUSES as readonly string[]).includes(status);
}

/** Correct a recurring occurrence (or any entry). Records every change as an
 *  append-only ExpenseAdjustment (previous value preserved), removes the amount
 *  from totals when the corrected status means "not debited", and terminates the
 *  parent subscription when the occurrence shows it ended. */
export async function correctOccurrence(entryId: string, c: OccurrenceCorrection, actor: string | null) {
  const before = await prisma.expenseEntry.findUnique({ where: { id: entryId } });
  if (!before) throw new Error("Occurrence introuvable.");
  const fx = await fxRates();

  const audits: { field: string; oldValue: unknown; newValue: unknown }[] = [];
  const data: Prisma.ExpenseEntryUpdateInput = { updatedBy: actor };

  if (c.status !== before.status) {
    audits.push({ field: "status", oldValue: before.status, newValue: c.status });
    data.status = c.status;
  }
  if (c.paymentReference !== undefined && c.paymentReference !== before.paymentReference) {
    audits.push({ field: "paymentReference", oldValue: before.paymentReference, newValue: c.paymentReference });
    data.paymentReference = c.paymentReference;
  }
  if (c.notes !== undefined) data.notes = c.notes;

  const debited = !isNotDebited(c.status);
  if (debited && c.paidAmount !== undefined) {
    const { amountMad, rate } = convertToMad(c.paidAmount, c.paidCurrency ?? before.currency, fx);
    if (num(before.amountOriginal) !== c.paidAmount) {
      audits.push({ field: "amountOriginal", oldValue: num(before.amountOriginal), newValue: c.paidAmount });
    }
    data.amountOriginal = c.paidAmount;
    data.paidAmount = c.paidAmount;
    data.exchangeRateToMad = rate;
    data.amountMad = amountMad;
    if (c.paidCurrency) data.currency = c.paidCurrency;
  }
  if (debited && c.paidDate !== undefined) {
    data.paidDate = c.paidDate ? new Date(c.paidDate) : null;
  }
  if (!debited) {
    // Reverse its effect on totals: it no longer counts as paid. Keep
    // amountOriginal for the "montant retiré" audit/display, but null the paid
    // figures + amountMad so it can never be summed.
    if (before.status === "paid") {
      audits.push({ field: "amountMad", oldValue: num(before.amountMad), newValue: null });
    }
    data.paidAmount = null;
    data.paidDate = null;
    data.amountMad = null;
    data.paidExchangeRate = null;
  }

  const terminate =
    Boolean(before.recurringExpenseId) &&
    (c.subscriptionContinued === false || c.status === "subscription_cancelled" || c.status === "subscription_expired");

  const updated = await prisma.$transaction(async (tx) => {
    const e = await tx.expenseEntry.update({ where: { id: entryId }, data });
    if (audits.length) {
      await tx.expenseAdjustment.createMany({
        data: audits.map((a) => ({
          expenseEntryId: entryId,
          kind: "correction",
          field: a.field,
          oldValue: a.oldValue == null ? Prisma.DbNull : (a.oldValue as Prisma.InputJsonValue),
          newValue: a.newValue == null ? Prisma.DbNull : (a.newValue as Prisma.InputJsonValue),
          reason: c.notes ?? null,
          createdBy: actor,
        })),
      });
    }
    if (terminate && before.recurringExpenseId) {
      const type: TerminationType = c.status === "subscription_expired" ? "expired" : "cancelled";
      await tx.recurringExpense.update({
        where: { id: before.recurringExpenseId },
        data: {
          status: "cancelled",
          terminationType: type,
          terminatedAt: c.paidDate ? new Date(c.paidDate) : (before.occurrenceDate ?? new Date()),
          terminationReason: c.notes ?? null,
        },
      });
    }
    return e;
  });

  return {
    entry: updated,
    before,
    terminated: terminate,
    removedAmount: !debited && before.status === "paid" ? num(before.amountOriginal) : null,
    removedCurrency: before.currency,
  };
}

export type DropOptions = {
  effectiveDate?: string | null;
  terminationType: "cancelled" | "expired";
  reason?: string | null;
  lastOccurrencePaid: boolean;
  note?: string | null;
};

/** "Marquer comme abonnement résilié" — terminate the subscription: mark it
 *  inactive (stops future occurrences + reminders since those filter on active),
 *  and if the last scheduled occurrence was NOT actually charged, reverse the
 *  most recent paid occurrence with a full audit trail. */
export async function dropSubscription(recurringId: string, opts: DropOptions, actor: string | null) {
  const r = await prisma.recurringExpense.findUnique({
    where: { id: recurringId },
    include: { occurrences: { where: { status: "paid" }, orderBy: { paidDate: "desc" }, take: 1 } },
  });
  if (!r) throw new Error("Abonnement introuvable.");
  const effective = opts.effectiveDate ? new Date(opts.effectiveDate) : new Date();
  let removedAmount: number | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.recurringExpense.update({
      where: { id: recurringId },
      data: {
        status: "cancelled",
        terminationType: opts.terminationType,
        terminatedAt: effective,
        terminationReason: opts.reason ?? null,
      },
    });
    if (!opts.lastOccurrencePaid && r.occurrences[0]) {
      const occ = r.occurrences[0];
      removedAmount = num(occ.amountOriginal);
      const newStatus = opts.terminationType === "expired" ? "subscription_expired" : "subscription_cancelled";
      await tx.expenseEntry.update({
        where: { id: occ.id },
        data: { status: newStatus, paidAmount: null, paidDate: null, amountMad: null, paidExchangeRate: null, updatedBy: actor },
      });
      await tx.expenseAdjustment.create({
        data: {
          expenseEntryId: occ.id,
          kind: "reversal",
          field: "status",
          oldValue: "paid",
          newValue: newStatus,
          reason: opts.reason ?? "Abonnement résilié — occurrence non débitée",
          createdBy: actor,
        },
      });
    }
  });

  return { name: r.name, terminationType: opts.terminationType, effective, lastOccurrencePaid: opts.lastOccurrencePaid, reason: opts.reason ?? null, removedAmount, currency: r.currency };
}

/** Delete a recurring subscription. Hard-delete only when it has no paid
 *  occurrences (an unused draft); otherwise cancel (preserve history). */
export async function deleteRecurring(recurringId: string, hard: boolean) {
  const paidCount = await prisma.expenseEntry.count({
    where: { recurringExpenseId: recurringId, status: "paid" },
  });
  if (hard && paidCount === 0) {
    await prisma.recurringExpense.delete({ where: { id: recurringId } });
    return { deleted: true };
  }
  await prisma.recurringExpense.update({ where: { id: recurringId }, data: { status: "cancelled" } });
  return { deleted: false };
}

/** Delete a standalone entry. Hard-delete only when unpaid (a draft); a paid
 *  entry is cancelled (archived), never erased. */
export async function deleteEntry(entryId: string, hard: boolean) {
  const e = await prisma.expenseEntry.findUnique({ where: { id: entryId }, select: { status: true } });
  if (!e) return { deleted: false };
  if (hard && e.status !== "paid") {
    await prisma.expenseEntry.delete({ where: { id: entryId } });
    return { deleted: true };
  }
  await prisma.expenseEntry.update({ where: { id: entryId }, data: { status: "cancelled" } });
  return { deleted: false };
}

// ── Notification log (idempotency + history) ─────────────────────────────────

export type NotificationRecord = {
  recurringExpenseId?: string | null;
  expenseEntryId?: string | null;
  occurrenceDate?: Date | null;
  kind: string;
  channel?: string;
  status: "sent" | "failed";
  error?: string | null;
  discordMessageId?: string | null;
  dedupeKey: string;
};

/** Idempotent insert: relies on the unique dedupeKey so a duplicate cron run is
 *  a no-op. Returns true if this call created the row (i.e. should proceed). */
export async function claimNotification(dedupeKey: string): Promise<boolean> {
  try {
    await prisma.expenseNotificationLog.create({
      data: { dedupeKey, kind: "_claim", status: "sent" },
    });
    return true;
  } catch {
    return false; // already claimed
  }
}

export async function recordNotification(rec: NotificationRecord) {
  return prisma.expenseNotificationLog.upsert({
    where: { dedupeKey: rec.dedupeKey },
    update: {
      status: rec.status,
      error: rec.error ?? null,
      discordMessageId: rec.discordMessageId ?? null,
      kind: rec.kind,
    },
    create: {
      recurringExpenseId: rec.recurringExpenseId ?? null,
      expenseEntryId: rec.expenseEntryId ?? null,
      occurrenceDate: rec.occurrenceDate ?? null,
      kind: rec.kind,
      channel: rec.channel ?? "expenses",
      status: rec.status,
      error: rec.error ?? null,
      discordMessageId: rec.discordMessageId ?? null,
      dedupeKey: rec.dedupeKey,
    },
  });
}

// ── End-of-month review: data collection ─────────────────────────────────────

function reviewEntryItem(
  e: Prisma.ExpenseEntryGetPayload<object>,
  fx: Record<string, number>,
): ReviewItem {
  const amountMad = num(e.amountMad) ?? convertToMad(num(e.amountOriginal), e.currency, fx).amountMad;
  return {
    key: `entry:${e.id}`,
    name: e.name,
    amountOriginal: num(e.amountOriginal),
    currency: e.currency,
    amountMad,
    scheduledDate: iso(e.dueDate ?? e.occurrenceDate),
    paidDate: iso(e.paidDate),
    status: e.status,
    isRecurring: e.recurringExpenseId != null || e.type === "recurring",
    estimated: e.amountEstimated && e.amountOriginal == null,
    corrected: false,
    note: null,
  };
}

/**
 * Gather everything relevant to the ending month for the review, using ONLY
 * real ledger statuses (never inferring "paid" from a date):
 *   • entries paid during the month,
 *   • unresolved open entries due this month or earlier (incl. estimated ones),
 *   • subscriptions terminated during the month,
 *   • active/paused subscriptions whose next occurrence is this month or overdue,
 *   • entries with a financially-relevant correction recorded this month,
 * plus a next-month preview. Deliberately excludes long-inactive subscriptions
 * with nothing unresolved and old resolved expenses outside the month.
 */
export async function collectMonthlyReviewData(
  ranges: ReviewRanges,
): Promise<{ items: ReviewItem[]; preview: ReviewItem[] }> {
  const fx = await fxRates();
  const { monthStart, monthEnd, nextMonthStart, nextMonthEnd } = ranges;

  const [paid, openEntries, terminated, recurrings, corrections, previewRecur, previewEntries] =
    await Promise.all([
      prisma.expenseEntry.findMany({ where: { status: "paid", paidDate: { gte: monthStart, lt: monthEnd } } }),
      prisma.expenseEntry.findMany({
        where: {
          status: { in: ["pending", "overdue", "upcoming", "estimated", "credit"] },
          OR: [{ dueDate: { lt: monthEnd } }, { dueDate: null }],
        },
      }),
      prisma.recurringExpense.findMany({
        where: { terminationType: { not: null }, terminatedAt: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.recurringExpense.findMany({
        where: { status: { in: ["active", "paused"] }, nextBillingDate: { lt: monthEnd } },
      }),
      prisma.expenseAdjustment.findMany({
        where: { kind: { in: ["correction", "reversal"] }, createdAt: { gte: monthStart, lt: monthEnd } },
        select: { expenseEntryId: true },
      }),
      prisma.recurringExpense.findMany({
        where: { status: "active", nextBillingDate: { gte: nextMonthStart, lt: nextMonthEnd } },
      }),
      prisma.expenseEntry.findMany({
        where: { status: { in: ["upcoming", "pending"] }, dueDate: { gte: nextMonthStart, lt: nextMonthEnd } },
      }),
    ]);

  const correctedIds = new Set(corrections.map((c) => c.expenseEntryId));
  const terminatedIds = new Set(terminated.map((r) => r.id));

  const items: ReviewItem[] = [];
  const seenEntryIds = new Set<string>();
  const pushEntry = (e: Prisma.ExpenseEntryGetPayload<object>) => {
    seenEntryIds.add(e.id);
    items.push({ ...reviewEntryItem(e, fx), corrected: correctedIds.has(e.id) });
  };

  for (const e of paid) pushEntry(e);
  for (const e of openEntries) pushEntry(e);

  // Corrected entries this month that weren't already captured (e.g. a paid
  // occurrence corrected to "unpaid" — an open-status query would miss it).
  // Skip those whose subscription is already shown under "terminated".
  const missingCorrectedIds = [...correctedIds].filter((id) => !seenEntryIds.has(id));
  if (missingCorrectedIds.length) {
    const correctedEntries = await prisma.expenseEntry.findMany({ where: { id: { in: missingCorrectedIds } } });
    for (const e of correctedEntries) {
      if (e.recurringExpenseId && terminatedIds.has(e.recurringExpenseId)) continue;
      items.push({ ...reviewEntryItem(e, fx), corrected: true });
    }
  }

  for (const r of terminated) {
    const expired = r.terminationType === "expired";
    const label = expired ? "abonnement expiré" : "abonnement résilié";
    items.push({
      key: `recur:${r.id}`,
      name: r.name,
      amountOriginal: num(r.amount),
      currency: r.currency,
      amountMad: convertToMad(num(r.amount), r.currency, fx).amountMad,
      scheduledDate: iso(r.terminatedAt),
      paidDate: null,
      status: expired ? "subscription_expired" : "subscription_cancelled",
      isRecurring: true,
      estimated: false,
      note: r.terminationReason ? `${label} — ${r.terminationReason}` : label,
    });
  }

  for (const r of recurrings) {
    if (terminatedIds.has(r.id)) continue; // already shown as terminated
    items.push({
      key: `recur:${r.id}`,
      name: r.name,
      amountOriginal: num(r.amount),
      currency: r.currency,
      amountMad: convertToMad(num(r.amount), r.currency, fx).amountMad,
      scheduledDate: iso(r.nextBillingDate),
      paidDate: null,
      status: occurrenceStatus(r), // upcoming | overdue | pending — never "paid"
      isRecurring: true,
      estimated: r.isUsageBased && r.amount == null,
    });
  }

  const preview: ReviewItem[] = [];
  for (const r of previewRecur) {
    preview.push({
      key: `recur:${r.id}`,
      name: r.name,
      amountOriginal: num(r.amount),
      currency: r.currency,
      amountMad: convertToMad(num(r.amount), r.currency, fx).amountMad,
      scheduledDate: iso(r.nextBillingDate),
      paidDate: null,
      status: "upcoming",
      isRecurring: true,
      estimated: r.isUsageBased && r.amount == null,
    });
  }
  for (const e of previewEntries) preview.push(reviewEntryItem(e, fx));

  return { items, preview };
}

// ── End-of-month review: idempotent send state + acknowledgement ─────────────

function toMonthlyReviewDTO(r: Prisma.ExpenseMonthlyReviewGetPayload<object>): MonthlyReviewDTO {
  return {
    id: r.id,
    monthKey: r.monthKey,
    status: r.status,
    attemptCount: r.attemptCount,
    discordMessageId: r.discordMessageId,
    error: r.error,
    sentAt: iso(r.sentAt),
    acknowledgedAt: iso(r.acknowledgedAt),
    acknowledgedBy: r.acknowledgedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Atomically claim the right to send this month's review. Ensures a row exists,
 * then flips it from a claimable state ("pending"/"failed") to "sending" in a
 * single UPDATE. A concurrent second run re-reads "sending" (not claimable) and
 * gets 0 → returns false. A row already "sent" also returns false (no duplicate).
 */
export async function claimMonthlyReview(monthKey: string): Promise<boolean> {
  await prisma.expenseMonthlyReview.upsert({
    where: { monthKey },
    update: {},
    create: { monthKey, status: "pending" },
  });
  const claimed = await prisma.expenseMonthlyReview.updateMany({
    where: { monthKey, status: { in: ["pending", "failed"] } },
    data: { status: "sending", attemptCount: { increment: 1 } },
  });
  return claimed.count > 0;
}

export async function recordMonthlyReviewResult(
  monthKey: string,
  result: { ok: boolean; messageId?: string | null; error?: string | null },
): Promise<void> {
  await prisma.expenseMonthlyReview.update({
    where: { monthKey },
    data: result.ok
      ? { status: "sent", discordMessageId: result.messageId ?? null, sentAt: new Date(), error: null }
      : { status: "failed", error: result.error ?? null },
  });
}

export async function getMonthlyReview(monthKey: string): Promise<MonthlyReviewDTO | null> {
  const r = await prisma.expenseMonthlyReview.findUnique({ where: { monthKey } });
  return r ? toMonthlyReviewDTO(r) : null;
}

export async function getMonthlyReviews(limit = 12): Promise<MonthlyReviewDTO[]> {
  const rows = await prisma.expenseMonthlyReview.findMany({
    orderBy: { monthKey: "desc" },
    take: limit,
  });
  return rows.map(toMonthlyReviewDTO);
}

/** Record acknowledgement ("Tout est correct") — evidence only; never touches
 *  any expense record or payment status. First acknowledgement wins. */
export async function acknowledgeMonthlyReview(monthKey: string, actor: string | null): Promise<MonthlyReviewDTO> {
  const existing = await prisma.expenseMonthlyReview.findUnique({ where: { monthKey } });
  if (!existing) throw new Error("Revue introuvable.");
  if (existing.acknowledgedAt) return toMonthlyReviewDTO(existing);
  const updated = await prisma.expenseMonthlyReview.update({
    where: { monthKey },
    data: { acknowledgedAt: new Date(), acknowledgedBy: actor },
  });
  return toMonthlyReviewDTO(updated);
}

/** Reset a failed/stuck row so it can be re-sent. A row already "sent" is left
 *  untouched (prevents a duplicate report). Returns whether a retry may proceed. */
export async function resetMonthlyReviewForRetry(monthKey: string): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.expenseMonthlyReview.findUnique({ where: { monthKey } });
  if (!existing) return { ok: true }; // claim will create it
  if (existing.status === "sent") return { ok: false, error: "Cette revue a déjà été envoyée." };
  await prisma.expenseMonthlyReview.update({ where: { monthKey }, data: { status: "pending" } });
  return { ok: true };
}
