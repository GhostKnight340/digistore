/**
 * Shared Sentry configuration for all three runtimes (server, edge, browser).
 *
 * Two non-negotiables:
 *
 *  1. NO DSN → NO-OP. The DSN does not exist yet. `Sentry.init({ dsn: undefined })`
 *     is already a no-op, but we skip init entirely so nothing is installed at
 *     all and the app builds and runs exactly as it did before.
 *
 *  2. NO SECRETS LEAVE THE BOX. Ghost.ma handles digital gift-card codes,
 *     payment proofs (base64 images), session cookies and supplier credentials.
 *     `sendDefaultPii` is false and {@link scrubEvent} strips anything that
 *     looks sensitive by KEY NAME before the event is transmitted. Key-name
 *     matching is deliberate: it fails closed on fields we haven't thought of
 *     yet (anything named *_token, *secret*, *code*…), which a value-pattern
 *     allowlist would not.
 *
 * Kept free of `server-only` and of any Node import so the browser bundle can
 * use it too.
 */

/** Redacted values are replaced with this, so their absence is visible. */
export const REDACTED = "[redacted]";

/**
 * Field names whose VALUES must never reach Sentry. Matched case-insensitively
 * against the whole key, anywhere in the event tree.
 */
const SENSITIVE_KEY = new RegExp(
  [
    "password",
    "passwd",
    "secret",
    "token",
    "authorization",
    "cookie",
    "session",
    "api[-_]?key",
    "client[-_]?secret",
    "credential",
    // Delivered gift-card material. Listed specifically rather than as a bare
    // "code" so ordinary `code` / `statusCode` error fields stay debuggable.
    "(gift|card|digital|activation|redemption|delivery|voucher|promo)[-_]?code",
    "codes",
    "card[-_]?number",
    "pin",
    "voucher",
    "serial",
    // Payment proof uploads (base64 image blobs) and payment identifiers.
    "proof",
    "receipt",
    "attachment",
    "dataurl",
    "data_uri",
    // Customer contact details.
    "email",
    "phone",
    "address",
  ].join("|"),
  "i",
);

/** Any inline data: URI is a payment proof or an image blob — never send it. */
const DATA_URI = /^data:[^;,]*;base64,/i;

function scrubValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return DATA_URI.test(value) ? REDACTED : value;
  return scrubTree(value, depth + 1);
}

/** Recursively redacts sensitive keys. Depth-capped so a cycle can't hang us. */
function scrubTree(node: unknown, depth = 0): unknown {
  if (depth > 8 || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((entry) => scrubTree(entry, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = scrubValue(key, value, depth);
  }
  return out;
}

/**
 * `beforeSend` / `beforeSendTransaction` body. Exported (and pure) so the
 * redaction rules can be tested without a live Sentry client.
 */
export function scrubEvent<T extends object>(event: T): T {
  const scrubbed = scrubTree(event) as T & Record<string, unknown>;
  // The whole Cookie / Authorization header, not just recognised sub-keys.
  const request = scrubbed.request as Record<string, unknown> | undefined;
  if (request) {
    delete request.cookies;
    const headers = request.headers as Record<string, unknown> | undefined;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (SENSITIVE_KEY.test(name)) headers[name] = REDACTED;
      }
    }
  }
  return scrubbed;
}

/** The DSN for this runtime, or undefined when monitoring is not configured. */
export function sentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

/**
 * Options every runtime shares. `environment` is passed in because the server
 * knows it from VERCEL_ENV while the browser only has the NEXT_PUBLIC_ mirror.
 */
export function sentryOptions(options: { dsn: string; environment: string; release?: string }) {
  return {
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    // Never let Sentry collect IPs, cookies or request bodies on its own.
    sendDefaultPii: false,
    // Errors are the point; traces are not, and every span costs quota.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    initialScope: {
      tags: {
        environment: options.environment,
        ...(options.release ? { release: options.release } : {}),
      },
    },
  };
}
