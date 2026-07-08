/**
 * Central reader for PayPal-related environment variables. No other module
 * should read `process.env.PAYPAL_*` directly — go through these accessors
 * so credential/environment logic stays in one place. Never log the values
 * returned here.
 *
 * Required env vars:
 *   PAYPAL_CLIENT_ID              - REST app client id (server-side)
 *   PAYPAL_CLIENT_SECRET          - REST app client secret (server-side only)
 *   PAYPAL_WEBHOOK_ID             - Webhook id from the PayPal dashboard, used
 *                                    to verify webhook signatures
 *   PAYPAL_ENV                    - "sandbox" or "live" (defaults to
 *                                    "sandbox" when unset)
 *   NEXT_PUBLIC_PAYPAL_CLIENT_ID  - Same client id, exposed to the browser so
 *                                    the PayPal JS SDK can render the button.
 *                                    This is the only PayPal value that is
 *                                    safe client-side; it identifies the app
 *                                    but grants no authority on its own.
 */

export type PayPalEnvironment = "sandbox" | "live";

export function getPayPalClientId(): string | undefined {
  return process.env.PAYPAL_CLIENT_ID || undefined;
}

export function getPayPalClientSecret(): string | undefined {
  return process.env.PAYPAL_CLIENT_SECRET || undefined;
}

export function getPayPalWebhookId(): string | undefined {
  return process.env.PAYPAL_WEBHOOK_ID || undefined;
}

/**
 * Fails closed to "sandbox" for anything other than an explicit "live", so a
 * missing/misconfigured env var can never accidentally take real money.
 */
export function getPayPalEnvironment(): PayPalEnvironment {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
}

export function isPayPalLive(): boolean {
  return getPayPalEnvironment() === "live";
}

export function isPayPalConfigured(): boolean {
  return (
    Boolean(getPayPalClientId()) &&
    Boolean(getPayPalClientSecret()) &&
    Boolean(getPayPalWebhookId())
  );
}

export const PAYPAL_API_BASE_URL = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const satisfies Record<PayPalEnvironment, string>;

export function getPayPalApiBaseUrl(): string {
  return PAYPAL_API_BASE_URL[getPayPalEnvironment()];
}
