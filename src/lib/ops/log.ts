import "server-only";

import { isProductionRuntime, runtimeEnvLabel } from "@/lib/env";
import { redactFreeText, safeErrorInfo, sanitizeTree } from "@/lib/monitoring/sanitize";

/**
 * Structured logging for critical flows.
 *
 * Before this, every log in the codebase was a bare `console.error("[tag]", err)`
 * — 93 of them. That meant no severity, no correlation, no environment, and
 * crucially **no redaction**: the worst leak in the audit was a `console.error`
 * that wrote gift-card codes into Vercel logs, somewhere the Sentry scrubber
 * could never reach.
 *
 * Every field written here goes through the shared sanitizer, so a caller that
 * accidentally passes `{ code, email }` gets `[redacted]` rather than a leak.
 * The logger is the safe default; that is the whole point of having one.
 *
 * Output is a single JSON line per event, because Vercel's log viewer parses
 * JSON into filterable fields and interleaves multi-line output unpredictably.
 *
 * This deliberately does NOT replace every console call in the codebase — that
 * would be a large, risky sweep. It is the tool that critical flows use, and
 * new code should use it.
 */

export type LogSeverity = "debug" | "info" | "warn" | "error";

/**
 * Context fields. Deliberately narrow: an operation name, a result, and small
 * scalar context. If you find yourself wanting to log a whole object, log the
 * two or three fields that would actually help instead.
 */
export interface LogContext {
  /** What was being attempted, e.g. "order.create" or "supplier.purchase". */
  operation: string;
  /** The PUBLIC order reference (#000123) — never the internal id, never the token. */
  orderRef?: string;
  /** Integration involved, e.g. "reloadly", "resend", "discord". */
  integration?: string;
  /** "ok" | "failed" | "skipped" | "retry" — how the operation ended. */
  result?: string;
  /** Stable, non-identifying error category for grouping. */
  code?: string;
  /** Additional safe scalars. Sanitized like everything else. */
  [key: string]: unknown;
}

/** Severities that should also reach Sentry when a DSN is configured. */
const CAPTURE_AT: LogSeverity[] = ["error"];

function emit(severity: LogSeverity, message: string, context: LogContext): void {
  const payload = {
    ts: new Date().toISOString(),
    severity,
    env: runtimeEnvLabel(),
    message: redactFreeText(message),
    ...(sanitizeTree(context) as Record<string, unknown>),
  };

  const line = JSON.stringify(payload);
  // Route by severity so Vercel's error filtering and local dev both behave.
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else if (severity === "debug") {
    // Debug is noise in production; keep it for local diagnosis only.
    if (!isProductionRuntime()) console.info(line);
  } else console.info(line);
}

export const log = {
  debug: (message: string, context: LogContext) => emit("debug", message, context),
  info: (message: string, context: LogContext) => emit("info", message, context),
  warn: (message: string, context: LogContext) => emit("warn", message, context),
  error: (message: string, context: LogContext) => emit("error", message, context),

  /**
   * Logs a thrown value safely and, when Sentry is configured, captures it.
   *
   * `Sentry.captureException` was previously never called from application code
   * — only the automatic `onRequestError` hook fired, so anything caught and
   * handled (every supplier failure, every email failure) was invisible in
   * Sentry. This is the hook that fixes that.
   *
   * The error's own message is reduced to a safe description first: supplier
   * SDKs routinely put the raw response body in `error.message`, and that body
   * is exactly where a delivered code lives.
   */
  exception: (error: unknown, context: LogContext) => {
    const info = safeErrorInfo(error);
    emit("error", `${info.name}: ${info.message}`, context);
    if (CAPTURE_AT.includes("error")) void captureIfConfigured(error, context);
  },
};

/**
 * Forwards to Sentry when a DSN exists. Dynamically imported and fully
 * swallowed: monitoring must never be able to break, delay or fail the flow it
 * is observing.
 */
async function captureIfConfigured(error: unknown, context: LogContext): Promise<void> {
  try {
    const { sentryDsn } = await import("@/lib/monitoring/sentry");
    if (!sentryDsn()) return;
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, {
      // Tags must stay low-cardinality and non-identifying — never a customer
      // id, never an email. The public order ref is deliberately a `contexts`
      // value rather than a tag for the same reason.
      tags: {
        operation: context.operation,
        ...(context.integration ? { integration: context.integration } : {}),
        ...(context.code ? { error_code: context.code } : {}),
      },
      contexts: { ghost: sanitizeTree(context) as Record<string, unknown> },
    });
  } catch {
    // Never rethrow from the logging path.
  }
}
