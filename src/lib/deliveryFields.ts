/**
 * Shared (client-safe) helpers for presenting delivered fulfillment fields.
 * Kept free of server-only imports so both the delivery page (client) and the
 * Discord DM builder (server) can classify fields the same way.
 */

/**
 * A redemption URL is a normal public link unless it embeds a sensitive token —
 * a query string, or a long opaque path segment (e.g. a one-time redeem token).
 * Only such URLs get the masked / spoiler treatment; a plain domain link does
 * not.
 */
export function urlHasSensitiveToken(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.search && parsed.search.length > 1) return true;
    return parsed.pathname
      .split("/")
      .some((segment) => segment.length >= 20 && /[0-9]/.test(segment) && /[a-z]/i.test(segment));
  } catch {
    return false;
  }
}
