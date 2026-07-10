import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getPricingSettings } from "@/lib/db/pricing-settings";
import { getExpenseConfig, claimNotification, recordNotification } from "@/lib/db/expenses";
import { sendExpenseEmbed } from "@/lib/discord/notify";
import {
  expenseReminderEmbed,
  expenseOverdueEmbed,
  monthlySummaryEmbed,
} from "@/lib/discord/expenseEmbeds";
import { convertToMad } from "@/lib/expenses/currency";
import type { DiscordEmbed } from "@/lib/discord/client";

const DAY = 86_400_000;

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysUntil(due: Date, today: Date): number {
  return Math.round((utcMidnight(due).getTime() - today.getTime()) / DAY);
}

/** Idempotent send: atomically claims the dedupeKey (unique) before posting, so a
 *  double-firing cron never sends twice. Returns whether it sent this time. */
async function sendOnce(params: {
  embed: DiscordEmbed;
  kind: string;
  dedupeKey: string;
  recurringExpenseId?: string | null;
  entryId?: string | null;
  occurrenceDate?: Date | null;
}): Promise<boolean> {
  const claimed = await claimNotification(params.dedupeKey);
  if (!claimed) return false;
  const result = await sendExpenseEmbed(params.embed);
  await recordNotification({
    recurringExpenseId: params.recurringExpenseId ?? null,
    expenseEntryId: params.entryId ?? null,
    occurrenceDate: params.occurrenceDate ?? null,
    kind: params.kind,
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error ?? null,
    discordMessageId: result.messageId ?? null,
    dedupeKey: params.dedupeKey,
  });
  return true;
}

export type CronResult = {
  remindersSent: number;
  overdueMarked: number;
  summaryPosted: boolean;
};

/** The full daily tick: mark overdue, emit due reminders, post the monthly
 *  summary on the configured day. Idempotent + safe to run more than once. */
export async function runExpenseCron(now = new Date()): Promise<CronResult> {
  const today = utcMidnight(now);
  const fx = (await getPricingSettings()).fxRatesToMad;
  const config = await getExpenseConfig();
  const result: CronResult = { remindersSent: 0, overdueMarked: 0, summaryPosted: false };

  // 1. Mark unpaid standalone entries past due as overdue.
  const marked = await prisma.expenseEntry.updateMany({
    where: { status: { in: ["upcoming", "pending"] }, dueDate: { lt: today } },
    data: { status: "overdue" },
  });
  result.overdueMarked = marked.count;

  if (!config.discordEnabled) {
    // No reminders without the channel, but overdue marking above still runs.
    return maybeSummary(result, now, config, fx);
  }

  // 2. Recurring reminders (per active subscription's next occurrence).
  const recurrings = await prisma.recurringExpense.findMany({ where: { status: "active" } });
  for (const r of recurrings) {
    const d = r.nextBillingDate;
    const du = daysUntil(d, today);
    const occ = isoDay(d);
    const amountMad = convertToMad(r.amount ? Number(r.amount) : null, r.currency, fx).amountMad;
    const amount = r.amount ? Number(r.amount) : null;

    if (du > 0 && r.reminderDaysBefore.includes(du)) {
      const sent = await sendOnce({
        recurringExpenseId: r.id, occurrenceDate: d, kind: `reminder_${du}d`,
        dedupeKey: `recur:${r.id}:${occ}:reminder_${du}d`,
        embed: expenseReminderEmbed({ name: r.name, amount, currency: r.currency, amountMad, dueDate: d.toISOString(), category: r.category, daysBefore: du }),
      });
      if (sent) result.remindersSent++;
    } else if (du === 0 && r.remindOnDue) {
      const sent = await sendOnce({
        recurringExpenseId: r.id, occurrenceDate: d, kind: "due",
        dedupeKey: `recur:${r.id}:${occ}:due`,
        embed: expenseReminderEmbed({ name: r.name, amount, currency: r.currency, amountMad, dueDate: d.toISOString(), category: r.category, daysBefore: 0 }),
      });
      if (sent) result.remindersSent++;
    } else if (du < 0 && r.remindOverdue) {
      const sent = await sendOnce({
        recurringExpenseId: r.id, occurrenceDate: d, kind: "overdue",
        dedupeKey: `recur:${r.id}:${occ}:overdue`,
        embed: expenseOverdueEmbed({ name: r.name, amount, currency: r.currency, dueDate: d.toISOString() }),
      });
      if (sent) result.remindersSent++;
    }
  }

  // 3. One-time / usage entries with a due date (use the default reminder offsets).
  const entries = await prisma.expenseEntry.findMany({
    where: { recurringExpenseId: null, status: { in: ["upcoming", "pending", "overdue"] }, dueDate: { not: null } },
  });
  for (const e of entries) {
    const d = e.dueDate!;
    const du = daysUntil(d, today);
    const amount = e.amountOriginal ? Number(e.amountOriginal) : null;
    const amountMad = e.amountMad ? Number(e.amountMad) : convertToMad(amount, e.currency, fx).amountMad;
    if (du > 0 && config.defaultReminderDaysBefore.includes(du)) {
      const sent = await sendOnce({
        entryId: e.id, kind: `reminder_${du}d`, dedupeKey: `entry:${e.id}:reminder_${du}d`,
        embed: expenseReminderEmbed({ name: e.name, amount, currency: e.currency, amountMad, dueDate: d.toISOString(), category: e.category, daysBefore: du }),
      });
      if (sent) result.remindersSent++;
    } else if (du === 0 && config.remindOnDue) {
      const sent = await sendOnce({
        entryId: e.id, kind: "due", dedupeKey: `entry:${e.id}:due`,
        embed: expenseReminderEmbed({ name: e.name, amount, currency: e.currency, amountMad, dueDate: d.toISOString(), category: e.category, daysBefore: 0 }),
      });
      if (sent) result.remindersSent++;
    } else if (du < 0 && config.remindOverdue) {
      const sent = await sendOnce({
        entryId: e.id, kind: "overdue", dedupeKey: `entry:${e.id}:overdue`,
        embed: expenseOverdueEmbed({ name: e.name, amount, currency: e.currency, dueDate: d.toISOString() }),
      });
      if (sent) result.remindersSent++;
    }
  }

  return maybeSummary(result, now, config, fx);
}

async function maybeSummary(
  result: CronResult,
  now: Date,
  config: Awaited<ReturnType<typeof getExpenseConfig>>,
  fx: Record<string, number>,
): Promise<CronResult> {
  if (!config.monthlySummaryEnabled || !config.discordEnabled) return result;
  if (now.getUTCDate() !== config.monthlySummaryDay) return result;

  // Previous full month.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const nextStart = monthEnd;
  const nextEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthKey = isoDay(monthStart).slice(0, 7); // YYYY-MM being summarised

  const [paid, prevPaid, upcomingRecur, upcomingEntries] = await Promise.all([
    prisma.expenseEntry.findMany({ where: { status: "paid", paidDate: { gte: monthStart, lt: monthEnd } }, select: { amountMad: true, type: true, category: true } }),
    prisma.expenseEntry.findMany({ where: { status: "paid", paidDate: { gte: prevStart, lt: monthStart } }, select: { amountMad: true } }),
    prisma.recurringExpense.findMany({ where: { status: "active", nextBillingDate: { gte: nextStart, lt: nextEnd } }, select: { amount: true, currency: true } }),
    prisma.expenseEntry.findMany({ where: { status: { in: ["upcoming", "pending", "overdue"] }, dueDate: { gte: nextStart, lt: nextEnd } }, select: { amountMad: true, amountOriginal: true, currency: true } }),
  ]);

  const madOf = (r: { amountMad: unknown }) => (r.amountMad != null ? Number(r.amountMad) : 0);
  const total = paid.reduce((s, r) => s + madOf(r), 0);
  const prevTotal = prevPaid.reduce((s, r) => s + madOf(r), 0);
  const recurringMad = paid.filter((r) => r.type === "recurring").reduce((s, r) => s + madOf(r), 0);
  const oneTimeMad = paid.filter((r) => r.type === "one_time" || r.type === "credit").reduce((s, r) => s + madOf(r), 0);
  const variableMad = paid.filter((r) => r.type === "usage_based").reduce((s, r) => s + madOf(r), 0);
  const byCatMap = new Map<string, number>();
  for (const r of paid) byCatMap.set(r.category, (byCatMap.get(r.category) ?? 0) + madOf(r));
  const byCategory = [...byCatMap.entries()].map(([category, amountMad]) => ({ category, amountMad })).sort((a, b) => b.amountMad - a.amountMad);

  const upcomingMad =
    upcomingRecur.reduce((s, r) => s + (convertToMad(r.amount ? Number(r.amount) : null, r.currency, fx).amountMad ?? 0), 0) +
    upcomingEntries.reduce((s, r) => s + (r.amountMad != null ? Number(r.amountMad) : convertToMad(r.amountOriginal ? Number(r.amountOriginal) : null, r.currency, fx).amountMad ?? 0), 0);
  const upcomingCount = upcomingRecur.length + upcomingEntries.length;

  const monthLabel = monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const sent = await sendOnce({
    kind: "monthly_summary",
    dedupeKey: `summary:${monthKey}`,
    embed: monthlySummaryEmbed({
      monthLabel, totalMad: total, recurringMad, oneTimeMad, variableMad, prevTotalMad: prevTotal,
      upcomingCount, upcomingMad, byCategory,
    }),
  });
  result.summaryPosted = sent;
  return result;
}
