/**
 * User-facing Discord replies for assistant outcomes — PURE (no server-only).
 *
 * Maps the coarse failure `reason` returned by the endpoint (provider error
 * categories, guardrail denials) to a short, useful message. Never exposes an
 * API key, model, provider internals, or a raw error body. Kept pure so the
 * mapping is unit-testable and shared by the worker.
 */

const GENERIC = "⚠️ Something went wrong answering that. Please try again shortly.";

export function assistantErrorReply(reason?: string | null): string {
  switch (reason) {
    case "provider_insufficient_credit":
      return "⚠️ The AI provider is out of credit. Ask an admin to top it up.";
    case "provider_rate_limited":
      return "⏳ The AI provider is rate-limited right now. Please try again in a moment.";
    case "provider_timeout":
      return "⚠️ That took too long to answer. Try a simpler question or retry.";
    case "provider_not_configured":
      return "⚠️ The assistant isn't fully configured yet (no AI model set).";
    case "provider_provider_disabled":
      return "⚠️ The AI provider is disabled in AI Operations settings.";
    case "global_disabled":
    case "module_disabled":
    case "module_missing":
      return "⚠️ The CEO assistant is currently turned off.";
    case "module_daily_executions":
    case "module_daily_cost":
    case "month_hard_limit":
    case "month_warning_exceeded":
    case "rate_limited":
      return "⏳ The AI usage limit has been reached for now. Please try again later.";
    default:
      return GENERIC;
  }
}

/** The reply shown when the model returns an empty answer. */
export const EMPTY_ANSWER_REPLY = "🤔 I couldn't produce an answer for that. Try rephrasing.";

/** `help` command — a brief guide to what the CEO assistant can answer. */
export const HELP_REPLY = [
  "**Ghost.ma CEO Assistant** — ask about your business in plain English or French.",
  "",
  "I can cover:",
  "• **Sales & revenue** — “How are sales today?”, “Show this month's revenue.”",
  "• **Orders** — “How many pending orders?”, “How many completed today?”",
  "• **Payments** — “What payment methods were used this week?”",
  "• **Products** — “What sold best last week?”",
  "• **Customers** — “How many new customers this month?”",
  "• **Operations** — “What issues need my attention?”, “What changed over the past 7 days?”",
  "",
  "I understand periods like *today, yesterday, this week, last month, or July 1–15*, and comparisons (*today vs yesterday*).",
  "",
  "Commands: `@Ghost CEO reset` clears our conversation · `@Ghost CEO help` shows this.",
].join("\n");

/** `reset` command confirmation. */
export const RESET_REPLY = "🧹 Conversation cleared. We're starting fresh.";
