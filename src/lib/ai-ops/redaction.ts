/**
 * Redaction for anything an AI module is about to see or log.
 *
 * This does NOT reinvent the rules — it reuses the single redaction source,
 * src/lib/monitoring/sanitize.ts (the same rules the structured logger and the
 * Sentry scrubber use), and layers on the AI-context specifics the spec calls
 * out: supplier credentials, complete payment account details, internal
 * environment values. Key-name matching fails closed on fields nobody thought
 * of yet.
 *
 * Every tool result and every bit of context handed to a provider goes through
 * {@link redactForAiContext} when redaction is enabled.
 */

import {
  REDACTED,
  SENSITIVE_KEY,
  sanitizeTree,
} from "@/lib/monitoring/sanitize";

/**
 * AI-context-specific sensitive key patterns, on top of the shared SENSITIVE_KEY
 * set (which already covers password, secret, token, authorization, cookie,
 * session, api_key, client_secret, credential, gift/card/digital codes, pin,
 * card_number, proof, receipt, email, phone, address). These add the supplier,
 * payment-account, and internal-env cases.
 */
export const AI_EXTRA_SENSITIVE_KEY = new RegExp(
  [
    "supplier[-_]?(secret|token|key|credential|password)",
    "reloadly[-_]?(client)?[-_]?(secret|id|key)",
    "fazercards?[-_]?(secret|key|token)",
    "iban",
    "rib",
    "swift",
    "bic",
    "account[-_]?number",
    "routing",
    "cvv",
    "cvc",
    "env(ironment)?[-_]?(var|value|secret)",
    "process[-_]?env",
    "database[-_]?url",
    "connection[-_]?string",
    "private[-_]?key",
    "webhook[-_]?secret",
    "hash",
    "salt",
  ].join("|"),
  "i",
);

/** True if a key name is sensitive by either the shared or AI-extra rules. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || AI_EXTRA_SENSITIVE_KEY.test(key);
}

/**
 * Recursively redacts a value for AI consumption. First applies the shared
 * sanitizer (handles data: URIs, depth caps, the common sensitive keys), then a
 * second pass for the AI-extra keys. Returns a deep copy — never mutates input.
 */
export function redactForAiContext<T>(value: T): T {
  const first = sanitizeTree(value);
  return redactExtra(first) as T;
}

function redactExtra(node: unknown, depth = 0): unknown {
  if (depth > 8 || node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((e) => redactExtra(e, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    out[key] = AI_EXTRA_SENSITIVE_KEY.test(key) ? REDACTED : redactExtra(val, depth + 1);
  }
  return out;
}

/**
 * Audit helper: walks a (already-redacted) tree and returns the key paths that
 * still hold a non-redacted value under a sensitive key name. Used by tests to
 * prove nothing leaks. An empty array means clean.
 */
export function findLeakedSensitiveKeys(node: unknown, path = ""): string[] {
  const leaks: string[] = [];
  const walk = (n: unknown, p: string, depth: number) => {
    if (depth > 8 || n === null || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach((e, i) => walk(e, `${p}[${i}]`, depth + 1));
      return;
    }
    for (const [key, val] of Object.entries(n as Record<string, unknown>)) {
      const childPath = p ? `${p}.${key}` : key;
      if (isSensitiveKey(key) && val !== REDACTED && typeof val !== "object") {
        leaks.push(childPath);
      }
      walk(val, childPath, depth + 1);
    }
  };
  walk(node, path, 0);
  return leaks;
}

export { REDACTED };
