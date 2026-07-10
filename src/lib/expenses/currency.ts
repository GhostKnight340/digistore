/**
 * Expense currency + date helpers. Pure (no DB, no server-only) so they're
 * testable and importable anywhere.
 *
 * Reporting conversion reuses the pricing FX table (MAD-per-unit) but applies
 * NO sales margin and NO rounding-to-increment — those are storefront pricing
 * concerns. The rate used is snapshotted onto each ledger row so editing global
 * rates later never rewrites historical totals.
 */

/** Convert an original amount to its DH (MAD) reporting figure.
 *  Returns the rate used so it can be frozen onto the record. MAD is the base
 *  (rate 1); an unsupported currency returns nulls (shown as "taux manquant"). */
export function convertToMad(
  amount: number | null | undefined,
  currency: string,
  fxRatesToMad: Record<string, number>,
): { amountMad: number | null; rate: number | null } {
  if (amount == null || Number.isNaN(amount)) return { amountMad: null, rate: null };
  const code = currency.trim().toUpperCase();
  if (code === "MAD" || code === "DH") return { amountMad: amount, rate: 1 };
  const rate = fxRatesToMad[code];
  if (rate == null || !Number.isFinite(rate)) return { amountMad: null, rate: null };
  return { amountMad: amount * rate, rate };
}

// ── Recurrence date math ─────────────────────────────────────────────────────

/** Add whole months, clamping the day to the target month's last day
 *  (e.g. Jan 31 + 1 month → Feb 28/29) — standard subscription behaviour. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Next billing date for a frequency, computed from the current billing date so
 *  the exact day-of-month/anniversary is preserved. */
export function nextBillingDate(
  from: Date,
  frequency: string,
  customIntervalDays?: number | null,
): Date {
  switch (frequency) {
    case "weekly":
      return addDays(from, 7);
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "semiannual":
      return addMonths(from, 6);
    case "yearly":
      return addMonths(from, 12);
    case "custom":
      return addDays(from, Math.max(1, Math.round(customIntervalDays ?? 30)));
    default:
      return addMonths(from, 1);
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Original amount + currency, e.g. "20 USD" / "120 DH". Currency stays exactly
 *  as entered; only the MAD label is prettified to "DH" for display. */
export function formatOriginal(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  const code = currency.trim().toUpperCase();
  const label = code === "MAD" ? "DH" : code;
  return `${numberFmt.format(amount)} ${label}`;
}

/** DH reporting equivalent, e.g. "204 DH". */
export function formatMadAmount(amountMad: number | null | undefined): string {
  if (amountMad == null) return "—";
  return `${numberFmt.format(amountMad)} DH`;
}

/** Short date used across the expense views, e.g. "18 août 2026". */
export function formatExpenseDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
