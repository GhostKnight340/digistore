/**
 * Pure Discord embed builders for the expense feed. No server-only / no DB —
 * the notify layer sends the returned embed. Concise, structured, and NEVER
 * includes credentials, card/RIB details, invoices, or tokens — only the
 * service, amount, currency, DH equivalent, frequency, dates, category, status,
 * and actor.
 */
import type { DiscordEmbed, DiscordMessagePayload } from "./client";
import { DISCORD_BUTTON_STYLE, DISCORD_COMPONENT_TYPE } from "./client";
import { formatOriginal, formatMadAmount, formatExpenseDate } from "@/lib/expenses/currency";
import { expenseCategoryLabel, expenseFrequencyLabel, expenseStatusLabel } from "@/lib/expenses/constants";
import {
  REVIEW_CONTROL_QUESTION,
  reviewSummaryLines,
  type MonthlyReviewModel,
} from "@/lib/expenses/monthlyReview";

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

export function subscriptionDroppedEmbed(d: {
  name: string;
  effectiveDate: string;
  lastOccurrencePaid: boolean;
  reason?: string | null;
}): DiscordEmbed {
  return {
    title: "🛑 Abonnement résilié",
    color: COLOR.red,
    fields: [
      { name: "Service", value: d.name, inline: true },
      { name: "Date effective", value: formatExpenseDate(d.effectiveDate), inline: true },
      { name: "Dernière échéance", value: d.lastOccurrencePaid ? "Débitée" : "Non débitée", inline: true },
      { name: "Occurrences futures", value: "Désactivées", inline: true },
      ...(d.reason ? [{ name: "Motif", value: d.reason }] : []),
    ],
  };
}

export function expenseCorrectedEmbed(d: {
  name: string;
  oldStatus: string;
  newStatus: string;
  removedAmount: number | null;
  currency: string;
  futureDisabled: boolean;
}): DiscordEmbed {
  const fields = [
    { name: "Service", value: d.name, inline: true },
    { name: "Ancien statut", value: expenseStatusLabel(d.oldStatus), inline: true },
    { name: "Nouveau statut", value: expenseStatusLabel(d.newStatus), inline: true },
  ];
  if (d.removedAmount != null) {
    fields.push({ name: "Montant retiré des dépenses", value: formatOriginal(d.removedAmount, d.currency), inline: true });
  }
  if (d.futureDisabled) {
    fields.push({ name: "Occurrences futures", value: "Désactivées", inline: true });
  }
  return { title: "✏️ Dépense corrigée", color: COLOR.amber, fields };
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

// Discord's per-embed description hard limit is 4096 chars; stay under it.
const REVIEW_DESC_LIMIT = 3900;
const MAX_LINES_PER_GROUP = 15;
const MAX_PREVIEW_LINES = 10;

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Build the end-of-month expense review message: a single rich embed (grouped
 * by status, with summary, control question, "À vérifier" list, and next-month
 * preview) plus a LINK button to the admin expenses page. Pure — the notify
 * layer sends it and the caller persists the outcome.
 *
 * The message never asks Discord to change anything; it is a review request. The
 * only interactive element is the link button, which just opens the admin.
 */
export function monthlyReviewMessage(model: MonthlyReviewModel, adminUrl: string): DiscordMessagePayload {
  const sections: string[] = [];

  for (const group of model.groups) {
    const shown = group.lines.slice(0, MAX_LINES_PER_GROUP);
    const hidden = group.lines.length - shown.length;
    const body = shown
      .map((l) => (l.note ? `${l.text} _(${l.note})_` : l.text))
      .join("\n");
    const more = hidden > 0 ? `\n… +${hidden} autre${hidden > 1 ? "s" : ""}` : "";
    sections.push(`${group.emoji} **${group.label}**\n${body}${more}`);
  }

  if (model.isEmpty) {
    sections.push("_Aucune dépense à revoir pour ce mois._");
  }

  sections.push(`**Résumé :**\n${reviewSummaryLines(model).join("\n")}`);
  sections.push(`❓ **${REVIEW_CONTROL_QUESTION}**`);

  if (model.attention.length > 0) {
    sections.push(`**À vérifier :**\n${model.attention.map((a) => `- ${a}`).join("\n")}`);
  }

  const previewBody =
    model.preview.length > 0
      ? model.preview.slice(0, MAX_PREVIEW_LINES).map((l) => l.text).join("\n")
      : "_Aucun paiement prévu._";
  sections.push(`📅 **À venir le mois prochain :**\n${previewBody}`);

  let description = sections.join("\n\n");
  if (description.length > REVIEW_DESC_LIMIT) {
    description = `${description.slice(0, REVIEW_DESC_LIMIT - 1)}…`;
  }

  return {
    embeds: [
      {
        title: `📋 Revue des dépenses — ${capitalize(model.monthLabel)}`,
        description,
        color: COLOR.blue,
      },
    ],
    components: [
      {
        type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE.BUTTON,
            style: DISCORD_BUTTON_STYLE.LINK,
            label: "Vérifier les dépenses",
            url: adminUrl,
          },
        ],
      },
    ],
  };
}
