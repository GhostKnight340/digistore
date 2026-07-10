/**
 * Pure Discord embed builders for the expense feed. No server-only / no DB —
 * the notify layer sends the returned embed. Concise, structured, and NEVER
 * includes credentials, card/RIB details, invoices, or tokens — only the
 * service, amount, currency, DH equivalent, frequency, dates, category, status,
 * and actor.
 */
import type { DiscordEmbed } from "./client";
import { formatOriginal, formatMadAmount, formatExpenseDate } from "@/lib/expenses/currency";
import { expenseCategoryLabel, expenseFrequencyLabel, expenseStatusLabel } from "@/lib/expenses/constants";

const COLOR = {
  blue: 0x3e7bfa,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  orange: 0xe67e22,
  red: 0xe74c3c,
  purple: 0x9b59b6,
  teal: 0x1abc9c,
  gray: 0x95a5a6,
} as const;

/** DH equivalent line, only when it differs from the original currency. */
function madLine(amountMad: number | null, currency: string): string | null {
  if (amountMad == null) return null;
  if (currency.trim().toUpperCase() === "MAD" || currency.trim().toUpperCase() === "DH") return null;
  return `≈ ${formatMadAmount(amountMad)}`;
}

export type ExpenseEmbedData = {
  name: string;
  amount: number | null;
  currency: string;
  amountMad: number | null;
  category: string;
  frequency?: string | null;
  nextDate?: string | null;
  dueDate?: string | null;
  status?: string;
  actor?: string | null;
  estimated?: boolean;
};

export function expenseCreatedEmbed(d: ExpenseEmbedData & { isRecurring: boolean }): DiscordEmbed {
  const amount = d.estimated && d.amount == null ? "Variable (estimée)" : formatOriginal(d.amount, d.currency);
  const fields = [
    { name: "Service", value: d.name, inline: true },
    { name: "Montant", value: amount, inline: true },
    { name: "Catégorie", value: expenseCategoryLabel(d.category), inline: true },
  ];
  const mad = madLine(d.amountMad, d.currency);
  if (mad) fields.push({ name: "Équivalent", value: mad, inline: true });
  if (d.isRecurring) {
    fields.push({ name: "Fréquence", value: expenseFrequencyLabel(d.frequency ?? ""), inline: true });
    fields.push({ name: "Prochain paiement", value: formatExpenseDate(d.nextDate), inline: true });
  } else if (d.dueDate) {
    fields.push({ name: "Date", value: formatExpenseDate(d.dueDate), inline: true });
  }
  fields.push({ name: "Statut", value: expenseStatusLabel(d.status ?? "upcoming"), inline: true });
  if (d.actor) fields.push({ name: "Ajoutée par", value: d.actor, inline: true });
  return {
    title: d.isRecurring ? "💸 Nouvelle dépense récurrente" : "💸 Nouvelle dépense",
    color: COLOR.blue,
    fields,
  };
}

export function expensePaidEmbed(d: {
  name: string;
  paidAmount: number;
  paidCurrency: string;
  amountMad: number | null;
  paidDate: string;
  nextDate?: string | null;
}): DiscordEmbed {
  const fields = [
    { name: "Service", value: d.name, inline: true },
    { name: "Montant payé", value: formatOriginal(d.paidAmount, d.paidCurrency), inline: true },
  ];
  const mad = madLine(d.amountMad, d.paidCurrency);
  if (mad) fields.push({ name: "Équivalent enregistré", value: formatMadAmount(d.amountMad), inline: true });
  fields.push({ name: "Date", value: formatExpenseDate(d.paidDate), inline: true });
  if (d.nextDate) fields.push({ name: "Prochain paiement", value: formatExpenseDate(d.nextDate), inline: true });
  return { title: "✅ Dépense payée", color: COLOR.green, fields };
}

export function expenseCancelledEmbed(d: { name: string; note?: string | null }): DiscordEmbed {
  return {
    title: "🚫 Dépense annulée",
    color: COLOR.gray,
    fields: [
      { name: "Service", value: d.name, inline: true },
      ...(d.note ? [{ name: "Note", value: d.note }] : []),
    ],
  };
}

export function expenseEditedEmbed(d: { name: string; changes: string }): DiscordEmbed {
  return {
    title: "✏️ Dépense modifiée",
    color: COLOR.amber,
    fields: [
      { name: "Service", value: d.name, inline: true },
      { name: "Modifications", value: d.changes },
    ],
  };
}

export function expenseReminderEmbed(d: {
  name: string;
  amount: number | null;
  currency: string;
  amountMad: number | null;
  dueDate: string;
  category: string;
  daysBefore: number;
}): DiscordEmbed {
  const when = d.daysBefore === 0 ? "aujourd'hui" : `dans ${d.daysBefore} jour${d.daysBefore > 1 ? "s" : ""}`;
  const fields = [
    { name: "Service", value: d.name, inline: true },
    { name: "Montant", value: formatOriginal(d.amount, d.currency), inline: true },
    { name: "Échéance", value: `${formatExpenseDate(d.dueDate)} (${when})`, inline: false },
    { name: "Catégorie", value: expenseCategoryLabel(d.category), inline: true },
  ];
  const mad = madLine(d.amountMad, d.currency);
  if (mad) fields.push({ name: "Équivalent", value: formatMadAmount(d.amountMad), inline: true });
  return { title: "⏰ Paiement à venir", color: COLOR.amber, fields };
}

export function expenseOverdueEmbed(d: {
  name: string;
  amount: number | null;
  currency: string;
  dueDate: string;
}): DiscordEmbed {
  return {
    title: "⚠️ Paiement en retard",
    color: COLOR.red,
    fields: [
      { name: "Service", value: d.name, inline: true },
      { name: "Montant", value: formatOriginal(d.amount, d.currency), inline: true },
      { name: "Échéance dépassée", value: formatExpenseDate(d.dueDate), inline: false },
    ],
  };
}

export function usageConfirmedEmbed(d: {
  name: string;
  amount: number;
  currency: string;
  amountMad: number | null;
}): DiscordEmbed {
  const fields = [
    { name: "Service", value: d.name, inline: true },
    { name: "Montant confirmé", value: formatOriginal(d.amount, d.currency), inline: true },
  ];
  const mad = madLine(d.amountMad, d.currency);
  if (mad) fields.push({ name: "Équivalent", value: formatMadAmount(d.amountMad), inline: true });
  return { title: "🧾 Dépense variable confirmée", color: COLOR.teal, fields };
}

export function monthlySummaryEmbed(d: {
  monthLabel: string;
  totalMad: number;
  recurringMad: number;
  oneTimeMad: number;
  variableMad: number;
  prevTotalMad: number;
  upcomingCount: number;
  upcomingMad: number;
  byCategory: { category: string; amountMad: number }[];
}): DiscordEmbed {
  const delta = d.totalMad - d.prevTotalMad;
  const deltaStr =
    d.prevTotalMad === 0 ? "—" : `${delta >= 0 ? "+" : ""}${formatMadAmount(delta)} vs mois précédent`;
  const cats = d.byCategory
    .filter((c) => c.amountMad > 0)
    .map((c) => `• ${expenseCategoryLabel(c.category)} : ${formatMadAmount(c.amountMad)}`)
    .join("\n");
  return {
    title: `📊 Résumé des dépenses — ${d.monthLabel}`,
    color: COLOR.purple,
    fields: [
      { name: "Total", value: formatMadAmount(d.totalMad), inline: true },
      { name: "Récurrentes", value: formatMadAmount(d.recurringMad), inline: true },
      { name: "Ponctuelles", value: formatMadAmount(d.oneTimeMad), inline: true },
      { name: "Variables", value: formatMadAmount(d.variableMad), inline: true },
      { name: "Évolution", value: deltaStr, inline: false },
      ...(cats ? [{ name: "Par catégorie", value: cats }] : []),
      {
        name: "À venir le mois prochain",
        value: `${d.upcomingCount} paiement${d.upcomingCount > 1 ? "s" : ""} — environ ${formatMadAmount(d.upcomingMad)}`,
      },
    ],
  };
}
