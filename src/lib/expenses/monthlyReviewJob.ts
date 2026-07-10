import "server-only";

/**
 * End-of-month expense review — orchestration (server-only). Wires the pure
 * review logic to the DB layer and the Discord sender. Reuses the existing
 * expense Discord integration and the ExpenseNotificationLog-style idempotency
 * (here a unique monthKey), so there is no second bot and no second scheduler.
 *
 * A Discord failure never touches any expense record: the review's own row is
 * flagged "failed" and can be retried safely, and a successful retry can never
 * produce a duplicate report (the claim only succeeds once per month).
 */
import {
  getExpenseConfig,
  collectMonthlyReviewData,
  claimMonthlyReview,
  recordMonthlyReviewResult,
  resetMonthlyReviewForRetry,
} from "@/lib/db/expenses";
import { sendExpenseMessage } from "@/lib/discord/notify";
import { monthlyReviewMessage } from "@/lib/discord/expenseEmbeds";
import {
  resolveReviewMoment,
  rangesForMonthKey,
  buildMonthlyReview,
  type ReviewRanges,
} from "@/lib/expenses/monthlyReview";
import { absoluteAppUrl } from "@/lib/orderNumber";

// The admin expenses panel is an in-place ?tab=; absoluteAppUrl resolves it to
// the configured production origin (never a localhost/preview host — it throws
// in production if no app URL is configured).
const ADMIN_EXPENSES_PATH = "/admin?tab=expenses";

export type MonthlyReviewRun = {
  fired: boolean;
  posted?: boolean;
  skipped?: boolean;
  monthKey?: string;
  reason?: string;
  error?: string;
};

async function sendForMonth(
  monthKey: string,
  monthLabel: string,
  ranges: ReviewRanges,
): Promise<{ ok: boolean; error?: string }> {
  const { items, preview } = await collectMonthlyReviewData(ranges);
  const model = buildMonthlyReview({ monthKey, monthLabel, items, preview });
  const payload = monthlyReviewMessage(model, absoluteAppUrl(ADMIN_EXPENSES_PATH));

  let result: { ok: boolean; messageId?: string; error?: string };
  try {
    result = await sendExpenseMessage(payload);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  await recordMonthlyReviewResult(monthKey, {
    ok: result.ok,
    messageId: result.messageId ?? null,
    error: result.error ?? null,
  });
  return { ok: result.ok, error: result.error };
}

/**
 * Daily evening cron entry point. Sends the review ONLY on the last business-tz
 * day of the month once the configured hour has passed, and only once (idempotent
 * per month). Safe to run every evening — non-last days and already-sent months
 * are no-ops.
 */
export async function runMonthlyReview(now = new Date()): Promise<MonthlyReviewRun> {
  const config = await getExpenseConfig();
  if (!config.discordEnabled || !config.monthlyReviewEnabled) {
    return { fired: false, reason: "disabled" };
  }
  const moment = resolveReviewMoment(now, config.businessTimezone, config.monthlyReviewHour);
  if (!moment.shouldFire) {
    return { fired: false, reason: "not_due", monthKey: moment.monthKey };
  }
  const claimed = await claimMonthlyReview(moment.monthKey);
  if (!claimed) {
    return { fired: false, skipped: true, monthKey: moment.monthKey, reason: "already_sent" };
  }
  const res = await sendForMonth(moment.monthKey, moment.monthLabel, moment.ranges);
  return { fired: true, posted: res.ok, monthKey: moment.monthKey, error: res.error };
}

/** Admin retry of a specific month after a Discord failure. No-op (and reports
 *  an error) if that month was already sent successfully. */
export async function retryMonthlyReview(monthKey: string): Promise<MonthlyReviewRun> {
  const reset = await resetMonthlyReviewForRetry(monthKey);
  if (!reset.ok) return { fired: false, monthKey, error: reset.error };
  const claimed = await claimMonthlyReview(monthKey);
  if (!claimed) return { fired: false, skipped: true, monthKey, reason: "already_sent" };
  const { ranges, monthLabel } = rangesForMonthKey(monthKey);
  const res = await sendForMonth(monthKey, monthLabel, ranges);
  return { fired: true, posted: res.ok, monthKey, error: res.error };
}

/** Admin "send now" for the current ending month, bypassing the day/hour gate
 *  (still idempotent — a month already sent is skipped). Handy for testing the
 *  report without waiting for month-end. */
export async function sendMonthlyReviewNow(now = new Date()): Promise<MonthlyReviewRun> {
  const config = await getExpenseConfig();
  const moment = resolveReviewMoment(now, config.businessTimezone, config.monthlyReviewHour);
  const claimed = await claimMonthlyReview(moment.monthKey);
  if (!claimed) return { fired: false, skipped: true, monthKey: moment.monthKey, reason: "already_sent" };
  const res = await sendForMonth(moment.monthKey, moment.monthLabel, moment.ranges);
  return { fired: true, posted: res.ok, monthKey: moment.monthKey, error: res.error };
}
