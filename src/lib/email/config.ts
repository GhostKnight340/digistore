import "server-only";

// Centralized, server-only email configuration. Reads the exact, non-public
// environment variables so the Resend key is never exposed to the client.
//
// Required env (server-side only — never NEXT_PUBLIC_):
//   RESEND_API_KEY       Resend API key (secret)
//   EMAIL_FROM_NAME      Display name, e.g. "ghost.ma"
//   EMAIL_FROM_ADDRESS   From address, e.g. "no-reply@ghost.ma"
//   SUPPORT_EMAIL        Support inbox, also used as default reply-to
//   EMAIL_REPLY_TO       Optional explicit reply-to (falls back to SUPPORT_EMAIL)
//   ENABLE_REAL_EMAILS   "true" to send real emails outside production

const DEFAULT_FROM_NAME = "ghost.ma";
const DEFAULT_FROM_ADDRESS = "no-reply@ghost.ma";

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Secret. Never returned to the client. */
export function getResendApiKey(): string {
  return clean(process.env.RESEND_API_KEY);
}

export function getFromName(): string {
  return clean(process.env.EMAIL_FROM_NAME) || DEFAULT_FROM_NAME;
}

export function getFromAddress(): string {
  return clean(process.env.EMAIL_FROM_ADDRESS) || DEFAULT_FROM_ADDRESS;
}

/** Formatted "Name <addr>" sender for Resend. */
export function getFromHeader(): string {
  return `${getFromName()} <${getFromAddress()}>`;
}

/** Reply-to: explicit override, otherwise the support inbox. */
export function getReplyToAddress(): string {
  return clean(process.env.EMAIL_REPLY_TO) || clean(process.env.SUPPORT_EMAIL);
}

/**
 * Real emails go out in production, or when explicitly enabled in any other
 * environment. Anything else only writes a simulated EmailLog row.
 */
export function realEmailsEnabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ENABLE_REAL_EMAILS === "true";
}

export type EmailDiagnostics = {
  environment: string;
  resendKeyConfigured: boolean;
  realEmailsEnabled: boolean;
  fromAddressConfigured: boolean;
  fromAddress: string;
  replyToConfigured: boolean;
  replyToAddress: string;
};

/**
 * Secret-safe snapshot for the admin diagnostic panel. Reports whether each
 * setting is present without ever returning the API key value.
 */
export function getEmailDiagnostics(): EmailDiagnostics {
  return {
    environment: process.env.NODE_ENV ?? "unknown",
    resendKeyConfigured: getResendApiKey().length > 0,
    realEmailsEnabled: realEmailsEnabled(),
    // Report whether the env var was explicitly set (a built-in default is
    // always available, but the admin needs to know if they configured it).
    fromAddressConfigured: clean(process.env.EMAIL_FROM_ADDRESS).length > 0,
    fromAddress: getFromAddress(),
    replyToConfigured: getReplyToAddress().length > 0,
    replyToAddress: getReplyToAddress(),
  };
}
