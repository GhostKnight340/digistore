"use client";

/**
 * Thin wrapper over the existing Google Analytics (gtag) pipeline already loaded
 * in the root layout. No new provider, no PII. Every call is a no-op when gtag
 * isn't present (dev, blockers, SSR), so callers never need to guard.
 *
 * Only non-sensitive, aggregate-friendly events flow through here — never
 * customer emails, order numbers, or other personal data. Search terms are the
 * one free-text value passed (GA's standard `search_term`), matching common
 * ecommerce practice.
 */
type GtagParams = Record<string, string | number | boolean | undefined>;

type GtagFn = (command: "event", action: string, params?: GtagParams) => void;

export function trackEvent(action: string, params: GtagParams = {}): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", action, params);
  } catch {
    // Analytics must never break the UI.
  }
}
