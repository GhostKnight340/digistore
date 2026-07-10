/**
 * End-of-month expense review — PURE logic (no DB, no server-only, no Discord).
 *
 * This module owns three things, all testable in isolation:
 *   1. resolveReviewMoment — the business-timezone firing gate (is today the
 *      last calendar day of the month, and has the send hour passed?) plus the
 *      exact UTC month ranges to query for the ending month + next-month preview.
 *   2. buildMonthlyReview — grouping collected ledger items by status, the
 *      summary counts/totals, the "À vérifier" attention list, and the preview.
 *   3. evaluateClaim — the idempotency decision (send only when no successful
 *      report exists yet), mirrored atomically in the DB by a unique monthKey.
 *
 * It never decides that something was paid: statuses come straight from the
 * ledger, so a passed billing date stays "à confirmer"/"en retard" until the
 * admin explicitly confirms or corrects it.
 */
import { formatOriginal, formatMadAmount, formatExpenseDate } from "./currency";

// ── Business-timezone date math ──────────────────────────────────────────────

export type BusinessDateParts = { year: number; month: number; day: number; hour: number };

/** Wall-clock Y/M/D/H in a given IANA timezone for an absolute instant. */
export function businessDateParts(now: Date, timeZone: string): BusinessDateParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some engines format midnight as "24"
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour };
}

/** Calendar day count for a 1-based month; correct across leap years. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export type ReviewRanges = {
  monthStart: Date;
  monthEnd: Date;
  nextMonthStart: Date;
  nextMonthEnd: Date;
};

export type ReviewMoment = {
  /** True only on the last business-local day at/after the configured hour. */
  shouldFire: boolean;
  isLastDay: boolean;
  businessHour: number;
  monthKey: string; // "YYYY-MM" of the ending month
  monthLabel: string; // e.g. "juillet 2026"
  ranges: ReviewRanges;
};

/**
 * Decide whether the review should fire now and, if so, the exact month it
 * covers. Ranges are UTC instants derived from the business month number; at the
 * evening send time the business month equals the UTC month, so these bound the
 * ending month correctly (and roll over cleanly across year and leap boundaries).
 */
export function resolveReviewMoment(now: Date, timeZone: string, sendHour: number): ReviewMoment {
  const { year, month, day, hour } = businessDateParts(now, timeZone);
  const dim = daysInMonth(year, month);
  const isLastDay = day === dim;
  const mi = month - 1;
  const ranges: ReviewRanges = {
    monthStart: new Date(Date.UTC(year, mi, 1)),
    monthEnd: new Date(Date.UTC(year, mi + 1, 1)),
    nextMonthStart: new Date(Date.UTC(year, mi + 1, 1)),
    nextMonthEnd: new Date(Date.UTC(year, mi + 2, 1)),
  };
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = new Date(Date.UTC(year, mi, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    shouldFire: isLastDay && hour >= sendHour,
    isLastDay,
    businessHour: hour,
    monthKey,
    monthLabel,
    ranges,
  };
}

/** UTC month ranges + French label for a "YYYY-MM" key. Used when re-sending a
 *  specific month on demand (admin retry), independent of the firing gate. */
export function rangesForMonthKey(monthKey: string): { ranges: ReviewRanges; monthLabel: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const mi = m - 1;
  const ranges: ReviewRanges = {
    monthStart: new Date(Date.UTC(y, mi, 1)),
    monthEnd: new Date(Date.UTC(y, mi + 1, 1)),
    nextMonthStart: new Date(Date.UTC(y, mi + 1, 1)),
    nextMonthEnd: new Date(Date.UTC(y, mi + 2, 1)),
  };
  const monthLabel = new Date(Date.UTC(y, mi, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { ranges, monthLabel };
}

// ── Idempotency decision ─────────────────────────────────────────────────────

export type MonthlyReviewState = { status: string } | null;

/** Send only when there is no already-successful report for this month. A row in
 *  "pending"/"failed"/"sending" is retryable; "sent" is terminal (no duplicate).
 *  The DB enforces the same rule atomically via the unique monthKey + a claim. */
export function evaluateClaim(existing: MonthlyReviewState): { shouldSend: boolean } {
  if (existing && existing.status === "sent") return { shouldSend: false };
  return { shouldSend: true };
}

// ── Review model ─────────────────────────────────────────────────────────────

/** One collected ledger item feeding the review (from the DB layer). */
export type ReviewItem = {
  key: string; // dedupe key, e.g. "entry:<id>" / "recur:<id>"
  name: string;
  amountOriginal: number | null;
  currency: string;
  amountMad: number | null;
  scheduledDate: string | null; // due / billing date (ISO)
  paidDate: string | null; // actual paid date (ISO)
  status: string; // ledger status (never inferred from a date)
  isRecurring: boolean;
  estimated: boolean; // variable expense still awaiting a final amount
  corrected?: boolean; // had a financially-relevant correction this month
  note?: string | null; // short French note (résiliée / ignorée / estimée…)
};

export type ReviewGroupKey =
  | "paid"
  | "toConfirm"
  | "pending"
  | "overdue"
  | "ignored"
  | "terminated"
  | "variableNoFinal";

export const REVIEW_GROUP_ORDER: ReviewGroupKey[] = [
  "paid",
  "toConfirm",
  "pending",
  "overdue",
  "ignored",
  "terminated",
  "variableNoFinal",
];

export const REVIEW_GROUP_META: Record<ReviewGroupKey, { emoji: string; label: string }> = {
  paid: { emoji: "✅", label: "Payées" },
  toConfirm: { emoji: "⏳", label: "À confirmer" },
  pending: { emoji: "🕓", label: "En attente" },
  overdue: { emoji: "⚠️", label: "En retard" },
  ignored: { emoji: "🚫", label: "Ignorées" },
  terminated: { emoji: "🛑", label: "Résiliées / expirées" },
  variableNoFinal: { emoji: "📊", label: "Variables sans montant final" },
};

/** Map a ledger status to its review group. A variable expense still awaiting a
 *  final amount always lands in "variableNoFinal" regardless of its raw status. */
export function reviewGroupOf(item: ReviewItem): ReviewGroupKey {
  if (item.estimated && item.amountOriginal == null) return "variableNoFinal";
  switch (item.status) {
    case "paid":
    case "credit":
      return "paid";
    case "pending":
      return "toConfirm";
    case "upcoming":
    case "estimated":
      return "pending";
    case "overdue":
      return "overdue";
    case "subscription_cancelled":
    case "subscription_expired":
      return "terminated";
    case "unpaid":
    case "failed":
    case "cancelled":
    case "not_applicable":
      return "ignored";
    default:
      return "toConfirm";
  }
}

export type ReviewLine = { text: string; note?: string | null };

export type MonthlyReviewModel = {
  monthKey: string;
  monthLabel: string;
  groups: { key: ReviewGroupKey; emoji: string; label: string; lines: ReviewLine[] }[];
  summary: {
    confirmedCount: number;
    toVerifyCount: number;
    overdueCount: number;
    terminatedCount: number;
    confirmedMad: number;
    hasVariable: boolean;
  };
  attention: string[];
  preview: ReviewLine[];
  isEmpty: boolean;
};

function amountText(item: ReviewItem): string {
  if (item.estimated && item.amountOriginal == null) return "montant variable";
  return formatOriginal(item.amountOriginal, item.currency);
}

/** "• Vercel Pro — 20 USD — payée le 10 juillet 2026" (+ optional note line). */
function lineFor(item: ReviewItem, group: ReviewGroupKey): ReviewLine {
  const parts = [item.name, amountText(item)];
  if (group === "paid" && item.paidDate) {
    parts.push(`payée le ${formatExpenseDate(item.paidDate)}`);
  } else if (group === "terminated") {
    parts.push(item.note ?? "abonnement résilié");
  } else if (item.scheduledDate) {
    parts.push(`échéance du ${formatExpenseDate(item.scheduledDate)}`);
  }
  const madSuffix =
    item.amountMad != null && item.currency.trim().toUpperCase() !== "MAD" && !item.estimated
      ? ` (≈ ${formatMadAmount(item.amountMad)})`
      : "";
  const note = group === "terminated" ? null : buildNote(item);
  return { text: `• ${parts.join(" — ")}${madSuffix}`, note };
}

function buildNote(item: ReviewItem): string | null {
  if (item.note) return item.note;
  if (item.corrected) return "corrigée";
  if (item.estimated) return "estimée";
  return null;
}

/**
 * Assemble the full review from collected items. Items are de-duplicated by key
 * (a later occurrence of the same key enriches the earlier one — e.g. a
 * correction flag). Empty groups are dropped.
 */
export function buildMonthlyReview(
  input: { monthKey: string; monthLabel: string; items: ReviewItem[]; preview: ReviewItem[] },
): MonthlyReviewModel {
  const deduped = dedupe(input.items);

  const byGroup = new Map<ReviewGroupKey, ReviewItem[]>();
  for (const item of deduped) {
    const g = reviewGroupOf(item);
    (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(item);
  }

  const groups = REVIEW_GROUP_ORDER.flatMap((key) => {
    const items = byGroup.get(key);
    if (!items || items.length === 0) return [];
    const meta = REVIEW_GROUP_META[key];
    return [{ key, emoji: meta.emoji, label: meta.label, lines: items.map((it) => lineFor(it, key)) }];
  });

  const paid = byGroup.get("paid") ?? [];
  const toConfirm = byGroup.get("toConfirm") ?? [];
  const overdue = byGroup.get("overdue") ?? [];
  const terminated = byGroup.get("terminated") ?? [];
  const variable = byGroup.get("variableNoFinal") ?? [];

  const summary = {
    confirmedCount: paid.length,
    toVerifyCount: toConfirm.length + variable.length,
    overdueCount: overdue.length,
    terminatedCount: terminated.length,
    confirmedMad: paid.reduce((s, it) => s + (it.amountMad ?? 0), 0),
    hasVariable: variable.length > 0,
  };

  return {
    monthKey: input.monthKey,
    monthLabel: input.monthLabel,
    groups,
    summary,
    attention: buildAttention({ variable, overdue, toConfirm, paid }),
    preview: dedupe(input.preview).map((it) => lineFor(it, reviewGroupOf(it))),
    isEmpty: deduped.length === 0,
  };
}

function dedupe(items: ReviewItem[]): ReviewItem[] {
  const byKey = new Map<string, ReviewItem>();
  for (const item of items) {
    const existing = byKey.get(item.key);
    if (!existing) {
      byKey.set(item.key, { ...item });
      continue;
    }
    // Merge: keep the richer record, OR the correction/estimated flags together.
    byKey.set(item.key, {
      ...existing,
      corrected: existing.corrected || item.corrected,
      estimated: existing.estimated || item.estimated,
      note: existing.note ?? item.note,
    });
  }
  return [...byKey.values()];
}

const MAX_ATTENTION = 8;

/** Concise, actionable "À vérifier" bullets — the items most likely to need a
 *  human check, capped so the report stays scannable. */
function buildAttention(g: {
  variable: ReviewItem[];
  overdue: ReviewItem[];
  toConfirm: ReviewItem[];
  paid: ReviewItem[];
}): string[] {
  const out: string[] = [];
  for (const it of g.variable) out.push(`${it.name} : montant final non renseigné`);
  for (const it of g.overdue) out.push(`${it.name} : paiement en retard, non confirmé`);
  for (const it of g.toConfirm) out.push(`${it.name} : paiement à confirmer`);
  // A gentle nudge to re-check that recurring amounts still match reality.
  for (const it of g.paid) {
    if (it.isRecurring && it.amountOriginal != null) {
      out.push(`${it.name} : vérifier si le montant réel correspond toujours à ${formatOriginal(it.amountOriginal, it.currency)}`);
    }
  }
  return out.slice(0, MAX_ATTENTION);
}

/** The fixed control question that closes every report. */
export const REVIEW_CONTROL_QUESTION =
  "Y a-t-il un paiement, un montant, une date ou un abonnement que vous devez vérifier ou mettre à jour dans l'admin Ghost.ma ?";

/** One-line human summary of the counts/totals, used in the embed. */
export function reviewSummaryLines(model: MonthlyReviewModel): string[] {
  const s = model.summary;
  const lines = [
    `• ${s.confirmedCount} paiement${s.confirmedCount > 1 ? "s" : ""} confirmé${s.confirmedCount > 1 ? "s" : ""}`,
    `• ${s.toVerifyCount} à vérifier`,
    `• ${s.overdueCount} en retard`,
    `• Total confirmé : ${formatMadAmount(s.confirmedMad)}`,
  ];
  if (s.terminatedCount > 0) {
    lines.push(`• ${s.terminatedCount} abonnement${s.terminatedCount > 1 ? "s" : ""} résilié${s.terminatedCount > 1 ? "s" : ""} / expiré${s.terminatedCount > 1 ? "s" : ""}`);
  }
  if (s.hasVariable) lines.push("• Total estimé/non confirmé : montant variable");
  return lines;
}
