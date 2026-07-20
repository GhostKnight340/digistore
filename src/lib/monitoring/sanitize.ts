/**
 * The single redaction rule for everything that leaves the box.
 *
 * These rules started life inside the Sentry integration, where they were only
 * ever applied to Sentry events. That left every other outbound channel
 * unprotected: 93 raw `console.*` calls, Discord alert payloads, and API error
 * bodies all went out unscrubbed — and the worst real leak we found (FazerCards
 * dumping gift-card codes into Vercel logs) was a plain `console.error` that no
 * Sentry hook could ever have caught.
 *
 * So the rules live here, and Sentry, the structured logger and the alert layer
 * all import them. One place to audit, one place to fix.
 *
 * Key-name matching is deliberate: it fails CLOSED on fields nobody has thought
 * of yet (anything named `*_token`, `*secret*`, `*_code`…), which a
 * value-pattern allowlist would not.
 *
 * Kept free of `server-only` and of any Node import so the browser bundle can
 * use it too.
 */

/** Redacted values are replaced with this, so their absence is visible. */
export const REDACTED = "[redacted]";

/**
 * Field names whose VALUES must never leave the process. Matched
 * case-insensitively against the whole key, anywhere in the tree.
 */
export const SENSITIVE_KEY = new RegExp(
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

/** Depth cap. A cycle or a pathological payload must not hang or explode. */
const MAX_DEPTH = 8;

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return DATA_URI.test(value) ? REDACTED : value;
  return sanitizeTree(value, depth + 1);
}

/** Recursively redacts sensitive keys. Depth-capped so a cycle can't hang us. */
export function sanitizeTree(node: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((entry) => sanitizeTree(entry, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = sanitizeValue(key, value, depth);
  }
  return out;
}

/**
 * Reduces an unknown thrown value to a SAFE, loggable description.
 *
 * Error messages are the most common accidental leak in this codebase: supplier
 * SDKs put response bodies in `error.message`, and a response body is exactly
 * where a delivered code lives. So the message is length-capped and stripped of
 * anything that looks like an embedded secret, and the stack is never included
 * (it is Sentry's job, and it can carry interpolated values).
 */
export function safeErrorInfo(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: redactFreeText(error.message) };
  }
  if (typeof error === "string") return { name: "Error", message: redactFreeText(error) };
  return { name: "UnknownError", message: REDACTED };
}

/**
 * Free text (an error message, a provider description) can embed a secret that
 * key-name matching cannot see, because there is no key.
 *
 * This is heuristic and cannot be complete, so it is deliberately biased toward
 * over-redaction. Two rules matter most:
 *
 *  - **A message that IS a serialized payload gets replaced wholesale.** Supplier
 *    SDKs routinely put the raw response body in `error.message`, and that body
 *    is exactly where delivered codes live. There is no diagnostic value in a
 *    raw body in a log line anyway — the SHAPE is what helps, and that is what
 *    {@link sanitizeTree} is for.
 *  - **Code-shaped runs are redacted at a low threshold.** An earlier version
 *    only caught unbroken runs of 32+ characters, which is right for API keys
 *    and wrong for the thing most worth protecting: real gift-card codes are
 *    typically shorter and hyphen-grouped (`GIFT-CARD-CODE-1234567890ABCDEF` is
 *    31 characters and slipped straight through). Both shapes are covered now.
 */
export function redactFreeText(text: string, maxLength = 300): string {
  const trimmed = text.trim();
  // A JSON object/array as the entire message is a payload, not a description.
  if (/^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed)) {
    return `${REDACTED} (payload omitted, ${trimmed.length} chars)`;
  }

  const cleaned = text
    .replace(/data:[^;,]*;base64,[A-Za-z0-9+/=]+/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi, `Bearer ${REDACTED}`)
    // Hyphen/underscore-grouped code shapes: XXXX-XXXX-XXXX and longer. Catches
    // gift-card and activation codes, which the length rule below misses.
    .replace(/\b[A-Za-z0-9]{3,}(?:[-_][A-Za-z0-9]{3,}){2,}\b/g, REDACTED)
    // Long unbroken runs are keys or tokens far more often than they are words
    // worth reading in a log line.
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, REDACTED);
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}\u2026` : cleaned;
}
