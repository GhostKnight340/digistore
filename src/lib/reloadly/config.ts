/**
 * Central reader for Reloadly-related environment variables. No other module
 * should read `process.env.RELOADLY_*` directly — go through these accessors
 * so credential/environment logic stays in one place.
 *
 * Required env vars:
 *   RELOADLY_CLIENT_ID      - OAuth2 client id from the Reloadly dashboard
 *   RELOADLY_CLIENT_SECRET  - OAuth2 client secret from the Reloadly dashboard
 *   RELOADLY_ENV            - "sandbox" or "live" (defaults to "sandbox" when unset)
 *
 * Sandbox and live are entirely separate credential pairs on Reloadly's side
 * (separate dashboard toggle, separate client id/secret). Mixing a sandbox
 * client id with RELOADLY_ENV=live (or vice versa) will fail auth.
 */

export type ReloadlyEnvironment = "sandbox" | "live";

export function getReloadlyClientId(): string | undefined {
  return process.env.RELOADLY_CLIENT_ID || undefined;
}

export function getReloadlyClientSecret(): string | undefined {
  return process.env.RELOADLY_CLIENT_SECRET || undefined;
}

/**
 * Fails closed to "sandbox" for anything other than an explicit "live", so a
 * missing/misconfigured env var can never accidentally place a real-money
 * order.
 */
export function getReloadlyEnvironment(): ReloadlyEnvironment {
  return process.env.RELOADLY_ENV === "live" ? "live" : "sandbox";
}

export function isReloadlyLive(): boolean {
  return getReloadlyEnvironment() === "live";
}

export function isReloadlyConfigured(): boolean {
  return Boolean(getReloadlyClientId()) && Boolean(getReloadlyClientSecret());
}

export const RELOADLY_AUTH_URL = "https://auth.reloadly.com/oauth/token";

/**
 * OAuth2 "audience" values, which double as the API base URL for each
 * Reloadly product. A token issued for one audience will not authenticate
 * requests to another product's base URL.
 */
export const RELOADLY_GIFT_CARDS_AUDIENCE = {
  sandbox: "https://giftcards-sandbox.reloadly.com",
  live: "https://giftcards.reloadly.com",
} as const satisfies Record<ReloadlyEnvironment, string>;

export function getGiftCardsBaseUrl(): string {
  return RELOADLY_GIFT_CARDS_AUDIENCE[getReloadlyEnvironment()];
}
