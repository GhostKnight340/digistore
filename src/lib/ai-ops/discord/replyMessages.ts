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
