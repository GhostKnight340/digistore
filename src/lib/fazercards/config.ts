/**
 * Central reader for FazerCards-related environment variables. No other module
 * should read `process.env.FAZERCARDS_*` directly — go through these accessors
 * so credential logic stays in one place.
 *
 * Required env vars:
 *   FAZERCARDS_API_KEY        - reseller API key (reseller hub → Profile)
 * Optional env vars:
 *   FAZERCARDS_WEBHOOK_SECRET - HMAC secret for inbound order webhooks
 *                               (hub → Settings → Webhook); only needed once
 *                               the webhook receiver is enabled.
 *   FAZERCARDS_BASE_URL       - API base override (defaults to production).
 *
 * Unlike Reloadly, FazerCards has NO sandbox environment — every configured
 * key is a live key and every order spends real wallet balance. Treat
 * `isFazerCardsConfigured()` as the availability gate everywhere.
 */

export function getFazerCardsApiKey(): string | undefined {
  return process.env.FAZERCARDS_API_KEY || undefined;
}

export function getFazerCardsWebhookSecret(): string | undefined {
  return process.env.FAZERCARDS_WEBHOOK_SECRET || undefined;
}

export function isFazerCardsConfigured(): boolean {
  return Boolean(getFazerCardsApiKey());
}

export const FAZERCARDS_DEFAULT_BASE_URL = "https://api.fzr.cards/api/v2";

export function getFazerCardsBaseUrl(): string {
  return (process.env.FAZERCARDS_BASE_URL || FAZERCARDS_DEFAULT_BASE_URL).replace(/\/$/, "");
}
