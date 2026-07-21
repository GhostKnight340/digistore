/**
 * Timeframe parsing for the CEO assistant — PURE (no DB, no provider).
 *
 * A business question carries a period ("today", "yesterday", "this month", "la
 * semaine dernière"). This maps the question text to one of a fixed set of
 * timeframes and then to a bounded day-window the safe tools understand
 * (`periodDays` = older bound in days-ago, `untilDays` = newer bound in
 * days-ago; the window is `[now - periodDays, now - untilDays)`).
 *
 * Deterministic and keyword-based (English + French) so it needs no extra LLM
 * call and is unit-testable. Unrecognized phrasing defaults to "today", which
 * keeps answers honest (the assistant states the period it used).
 *
 * Windows are rolling day-offsets, consistent with the rest of AI-ops using
 * day-granular UTC math; "today" is the last 24h, matching the foundation's
 * existing convention. `now` is injected for deterministic tests.
 */

export const TIMEFRAMES = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export interface TimeWindow {
  /** Older bound, in days ago (inclusive lower bound = now - periodDays). */
  periodDays: number;
  /** Newer bound, in days ago (exclusive upper bound = now - untilDays). 0 = now. */
  untilDays: number;
  /** Human label the assistant echoes so it never misstates the period. */
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Classify a question's timeframe. Order matters: more specific phrases
 * ("yesterday", "last month") are checked before broader ones.
 */
export function parseTimeframe(question: string): Timeframe {
  const q = (question ?? "").toLowerCase();
  if (/\byesterday\b|\bhier\b/.test(q)) return "yesterday";
  if (/\blast month\b|\bprevious month\b|mois dernier|le mois pass[ée]/.test(q)) return "last_month";
  if (/\bthis month\b|\bmonth to date\b|ce mois|mois-ci|du mois|ce mois-ci/.test(q)) return "this_month";
  if (/\blast 30 days\b|\bpast 30 days\b|\b30 days\b|30 jours|trente jours/.test(q)) return "last_30_days";
  if (
    /\blast 7 days\b|\bpast 7 days\b|\b7 days\b|\bthis week\b|\blast week\b|\bweek\b|7 jours|cette semaine|la semaine|semaine derni[èe]re/.test(
      q,
    )
  )
    return "last_7_days";
  return "today";
}

/**
 * Concrete day-window for a timeframe. Calendar months are computed from `now`
 * (UTC), consistent with the budget/day aggregates; other frames are rolling.
 */
export function timeframeWindow(tf: Timeframe, now: number = Date.now()): TimeWindow {
  switch (tf) {
    case "today":
      return { periodDays: 1, untilDays: 0, label: "today" };
    case "yesterday":
      return { periodDays: 2, untilDays: 1, label: "yesterday" };
    case "last_7_days":
      return { periodDays: 7, untilDays: 0, label: "the last 7 days" };
    case "last_30_days":
      return { periodDays: 30, untilDays: 0, label: "the last 30 days" };
    case "this_month": {
      const d = new Date(now);
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const periodDays = Math.max(1, Math.ceil((now - start) / DAY_MS));
      return { periodDays, untilDays: 0, label: "this month" };
    }
    case "last_month": {
      const d = new Date(now);
      const startThis = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      const startPrev = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
      const periodDays = Math.ceil((now - startPrev) / DAY_MS);
      const untilDays = Math.floor((now - startThis) / DAY_MS);
      return { periodDays, untilDays, label: "last month" };
    }
  }
}

/** Convenience: parse a question straight to its window. */
export function questionWindow(question: string, now: number = Date.now()): TimeWindow {
  return timeframeWindow(parseTimeframe(question), now);
}
