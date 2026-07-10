"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listLedger,
  getSummary,
  getUpcomingPayments,
  getDetail,
  getExpenseConfig,
  getReceipt,
  createRecurring,
  createOneTime,
  updateRecurring,
  updateEntry,
  markRecurringOccurrencePaid,
  markEntryPaid,
  confirmUsageAmount,
  skipOccurrence,
  setRecurringStatus,
  deleteRecurring,
  deleteEntry,
  correctOccurrence,
  dropSubscription,
  getMonthlyReviews,
  acknowledgeMonthlyReview,
  type RecurringInput,
  type OneTimeInput,
  type PaidInfo,
  type OccurrenceCorrection,
  type DropOptions,
} from "@/lib/db/expenses";
import { getPricingSettings } from "@/lib/db/pricing-settings";
import { convertToMad } from "@/lib/expenses/currency";
import { postAndLog } from "@/lib/expenses/discord";
import {
  expenseCreatedEmbed,
  expensePaidEmbed,
  expenseCancelledEmbed,
  usageConfirmedEmbed,
  expenseCorrectedEmbed,
  subscriptionDroppedEmbed,
} from "@/lib/discord/expenseEmbeds";
import { runExpenseCron } from "@/lib/expenses/reminders";
import {
  retryMonthlyReview,
  sendMonthlyReviewNow,
} from "@/lib/expenses/monthlyReviewJob";
import type { ExpenseFilters, MonthlyReviewDTO } from "@/lib/expenses/types";

type Result = { ok: boolean; error?: string };

async function actor(): Promise<string> {
  const admin = await requireAdminCustomer();
  return admin.name;
}

async function expensesDiscordEnabled(): Promise<boolean> {
  return (await getExpenseConfig()).discordEnabled;
}

function validAmount(n: number | null | undefined, allowNegative = false): boolean {
  if (n == null) return true; // pending/estimated allowed
  return Number.isFinite(n) && (allowNegative || n >= 0);
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getExpensesAction(filters: ExpenseFilters = {}) {
  await requireAdminCustomer();
  return listLedger(filters);
}
export async function getExpenseSummaryAction() {
  await requireAdminCustomer();
  return getSummary();
}
export async function getUpcomingPaymentsAction() {
  await requireAdminCustomer();
  return getUpcomingPayments();
}
export async function getExpenseDetailAction(input: { recurringId?: string; entryId?: string }) {
  await requireAdminCustomer();
  return getDetail(input);
}
export async function getExpenseConfigAction() {
  await requireAdminCustomer();
  return getExpenseConfig();
}
export async function getExpenseReceiptAction(entryId: string) {
  await requireAdminCustomer();
  return getReceipt(entryId);
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createRecurringExpenseAction(input: RecurringInput): Promise<Result> {
  const who = await actor();
  if (!input.name?.trim()) return { ok: false, error: "Le nom du service est requis." };
  if (!input.nextBillingDate) return { ok: false, error: "La date de prochain paiement est requise." };
  if (!validAmount(input.amount, input.category === "credit")) return { ok: false, error: "Montant invalide." };
  if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
    return { ok: false, error: "La date de fin ne peut pas précéder la date de début." };
  }
  const r = await createRecurring(input, who);
  if (await expensesDiscordEnabled()) {
    const { amountMad } = convertToMad(input.amount, input.currency, (await getPricingSettings()).fxRatesToMad);
    await postAndLog({
      recurringExpenseId: r.id,
      kind: "created",
      dedupeKey: `recur:${r.id}:created`,
      embed: expenseCreatedEmbed({
        name: r.name, amount: input.amount, currency: input.currency, amountMad,
        category: input.category, frequency: input.frequency, nextDate: input.nextBillingDate,
        status: "upcoming", actor: who, isRecurring: true, estimated: input.isUsageBased,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function createOneTimeExpenseAction(input: OneTimeInput): Promise<Result> {
  const who = await actor();
  if (!input.name?.trim()) return { ok: false, error: "Le titre est requis." };
  if (input.type !== "credit" && input.type !== "usage_based" && !input.dueDate) {
    return { ok: false, error: "La date de la dépense est requise." };
  }
  if (!validAmount(input.amount, input.type === "credit")) return { ok: false, error: "Montant invalide." };
  const e = await createOneTime(input, who);
  if (await expensesDiscordEnabled()) {
    const { amountMad } = convertToMad(input.amount, input.currency, (await getPricingSettings()).fxRatesToMad);
    await postAndLog({
      entryId: e.id,
      kind: "created",
      dedupeKey: `entry:${e.id}:created`,
      embed: expenseCreatedEmbed({
        name: e.name, amount: input.amount, currency: input.currency, amountMad,
        category: input.category, dueDate: input.dueDate, status: input.status, actor: who,
        isRecurring: false, estimated: input.amountEstimated,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function updateRecurringExpenseAction(id: string, input: Partial<RecurringInput>): Promise<Result> {
  const who = await actor();
  if (input.amount !== undefined && !validAmount(input.amount, true)) return { ok: false, error: "Montant invalide." };
  await updateRecurring(id, input, who);
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateEntryAction(
  id: string,
  input: Partial<OneTimeInput> & { amount?: number | null },
): Promise<Result> {
  const who = await actor();
  if (input.amount !== undefined && !validAmount(input.amount, true)) return { ok: false, error: "Montant invalide." };
  await updateEntry(id, input, who);
  revalidatePath("/admin");
  return { ok: true };
}

// ── Pay / confirm ────────────────────────────────────────────────────────────

export async function markRecurringPaidAction(recurringId: string, paid: PaidInfo): Promise<Result> {
  const who = await actor();
  if (!validAmount(paid.paidAmount, true) || paid.paidAmount == null) return { ok: false, error: "Montant payé invalide." };
  const entry = await markRecurringOccurrencePaid(recurringId, paid, who);
  if (await expensesDiscordEnabled()) {
    const r = await getDetail({ recurringId });
    await postAndLog({
      recurringExpenseId: recurringId, entryId: entry.id, kind: "paid",
      dedupeKey: `entry:${entry.id}:paid`,
      embed: expensePaidEmbed({
        name: entry.name, paidAmount: paid.paidAmount, paidCurrency: paid.paidCurrency,
        amountMad: entry.amountMad ? Number(entry.amountMad) : null, paidDate: paid.paidDate,
        nextDate: r?.recurring?.nextBillingDate ?? null,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function markEntryPaidAction(entryId: string, paid: PaidInfo): Promise<Result> {
  const who = await actor();
  if (!validAmount(paid.paidAmount, true) || paid.paidAmount == null) return { ok: false, error: "Montant payé invalide." };
  const entry = await markEntryPaid(entryId, paid, who);
  if (await expensesDiscordEnabled()) {
    await postAndLog({
      entryId, kind: "paid", dedupeKey: `entry:${entryId}:paid`,
      embed: expensePaidEmbed({
        name: entry.name, paidAmount: paid.paidAmount, paidCurrency: paid.paidCurrency,
        amountMad: entry.amountMad ? Number(entry.amountMad) : null, paidDate: paid.paidDate,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function confirmUsageAction(entryId: string, amount: number, currency: string): Promise<Result> {
  const who = await actor();
  if (!validAmount(amount) || amount == null) return { ok: false, error: "Montant invalide." };
  const entry = await confirmUsageAmount(entryId, amount, currency, who);
  if (await expensesDiscordEnabled()) {
    await postAndLog({
      entryId, kind: "usage_confirmed", dedupeKey: `entry:${entryId}:usage_confirmed:${Date.now()}`,
      embed: usageConfirmedEmbed({
        name: entry.name, amount, currency, amountMad: entry.amountMad ? Number(entry.amountMad) : null,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

// ── Occurrence / subscription lifecycle ──────────────────────────────────────

export async function skipOccurrenceAction(recurringId: string): Promise<Result> {
  await actor();
  await skipOccurrence(recurringId);
  revalidatePath("/admin");
  return { ok: true };
}

export async function setRecurringStatusAction(
  recurringId: string,
  status: "active" | "paused" | "cancelled",
): Promise<Result> {
  await actor();
  const r = await setRecurringStatus(recurringId, status);
  if (status === "cancelled" && (await expensesDiscordEnabled())) {
    await postAndLog({
      recurringExpenseId: recurringId, kind: "cancelled", dedupeKey: `recur:${recurringId}:cancelled`,
      embed: expenseCancelledEmbed({ name: r.name }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteExpenseAction(
  input: { recurringId?: string; entryId?: string },
  hard = false,
): Promise<Result> {
  await actor();
  if (input.recurringId) await deleteRecurring(input.recurringId, hard);
  else if (input.entryId) await deleteEntry(input.entryId, hard);
  else return { ok: false, error: "Aucune dépense spécifiée." };
  revalidatePath("/admin");
  return { ok: true };
}

// ── Correction + subscription drop ───────────────────────────────────────────

export async function correctOccurrenceAction(entryId: string, correction: OccurrenceCorrection): Promise<Result> {
  const who = await actor();
  if (correction.paidAmount != null && !validAmount(correction.paidAmount, true)) {
    return { ok: false, error: "Montant invalide." };
  }
  const res = await correctOccurrence(entryId, correction, who);
  if (await expensesDiscordEnabled()) {
    // Post a correction notice when a paid occurrence is corrected in a
    // financially meaningful way (status change and/or amount removed).
    if (res.before.status !== correction.status || res.removedAmount != null) {
      await postAndLog({
        entryId, recurringExpenseId: res.before.recurringExpenseId, kind: "edited",
        dedupeKey: `entry:${entryId}:corrected:${Date.now()}`,
        embed: expenseCorrectedEmbed({
          name: res.before.name,
          oldStatus: res.before.status,
          newStatus: correction.status,
          removedAmount: res.removedAmount,
          currency: res.removedCurrency,
          futureDisabled: res.terminated,
        }),
      });
    }
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function dropSubscriptionAction(recurringId: string, opts: DropOptions): Promise<Result> {
  const who = await actor();
  const res = await dropSubscription(recurringId, opts, who);
  if (await expensesDiscordEnabled()) {
    await postAndLog({
      recurringExpenseId: recurringId, kind: "cancelled",
      dedupeKey: `recur:${recurringId}:dropped:${Date.now()}`,
      embed: subscriptionDroppedEmbed({
        name: res.name,
        effectiveDate: res.effective.toISOString(),
        lastOccurrencePaid: res.lastOccurrencePaid,
        reason: res.reason,
      }),
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

/** Manual trigger for the same idempotent logic the daily cron runs. */
export async function runDueRemindersAction(): Promise<
  Result & { remindersSent?: number; overdueMarked?: number; summaryPosted?: boolean }
> {
  await actor();
  const r = await runExpenseCron();
  revalidatePath("/admin");
  return { ok: true, ...r };
}

// ── Monthly review ────────────────────────────────────────────────────────────

export async function getMonthlyReviewsAction(limit = 12): Promise<MonthlyReviewDTO[]> {
  await requireAdminCustomer();
  return getMonthlyReviews(limit);
}

/** "Tout est correct" — records acknowledgement (date + admin identity) only.
 *  Never changes any payment status or expense record. */
export async function acknowledgeMonthlyReviewAction(monthKey: string): Promise<Result> {
  const who = await actor();
  try {
    await acknowledgeMonthlyReview(monthKey, who);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Action impossible." };
  }
  revalidatePath("/admin");
  return { ok: true };
}

/** Retry sending a specific month's review after a Discord failure. Idempotent:
 *  a month already sent is refused rather than duplicated. */
export async function retryMonthlyReviewAction(monthKey: string): Promise<Result> {
  await actor();
  const r = await retryMonthlyReview(monthKey);
  revalidatePath("/admin");
  if (r.error) return { ok: false, error: r.error };
  if (r.skipped) return { ok: false, error: "Cette revue a déjà été envoyée." };
  return { ok: r.posted ?? false, error: r.posted ? undefined : "Échec de l'envoi Discord." };
}

/** Send the current ending month's review now, bypassing the day/hour gate
 *  (still idempotent). For previewing/testing the report from the admin. */
export async function sendMonthlyReviewNowAction(): Promise<Result & { monthKey?: string }> {
  await actor();
  const r = await sendMonthlyReviewNow();
  revalidatePath("/admin");
  if (r.skipped) return { ok: false, error: "La revue de ce mois a déjà été envoyée.", monthKey: r.monthKey };
  if (!r.posted) return { ok: false, error: r.error ?? "Échec de l'envoi Discord.", monthKey: r.monthKey };
  return { ok: true, monthKey: r.monthKey };
}
