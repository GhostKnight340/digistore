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

// The redaction rules live in ./sanitize so that Sentry, the structured logger
// and the Discord alert layer all share ONE implementation. Re-exported here
// because callers and tests have imported them from this module since before
// the split.
export { REDACTED, SENSITIVE_KEY, sanitizeTree, safeErrorInfo } from "./sanitize";
import { REDACTED, SENSITIVE_KEY, sanitizeTree } from "./sanitize";

/**
 * `beforeSend` / `beforeSendTransaction` body. Exported (and pure) so the
 * redaction rules can be tested without a live Sentry client.
 */
export function scrubEvent<T extends object>(event: T): T {
  const scrubbed = sanitizeTree(event) as T & Record<string, unknown>;
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
