/**
 * Absolute site origin for canonical URLs, Open Graph, sitemap and robots.
 * Delegates to `appBaseUrl()` (src/lib/orderNumber.ts) so canonical/OG origins
 * and the origins we put in e-mails can never disagree — in particular so a
 * staging deployment self-references instead of pointing at production.
 * Falls back to the production origin when nothing is configured, since a
 * canonical URL must exist even where appBaseUrl() would rather throw.
 * Safe on both server and client.
 */
import { appBaseUrl } from "@/lib/orderNumber";

const FALLBACK = "https://ghost.ma";

export function getSiteUrl(): string {
  try {
    return appBaseUrl().replace(/\/+$/, "");
  } catch {
    return FALLBACK;
  }
}

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}
