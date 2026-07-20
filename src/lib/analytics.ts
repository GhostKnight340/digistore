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
type GtagScalar = string | number | boolean | undefined;

/**
 * One line of a GA4 ecommerce `items` array. Deliberately scalar-only and
 * catalog-only: an item is a product, never a customer. Nothing here can carry
 * an email, an order number or a delivered code.
 */
export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  price?: number;
  quantity?: number;
  index?: number;
  item_list_name?: string;
};

type GtagParams = Record<string, GtagScalar | AnalyticsItem[]>;

type GtagFn = (command: "event", action: string, params?: GtagParams) => void;

/** The only currency Ghost.ma prices in. GA4 requires it alongside `value`. */
export const ANALYTICS_CURRENCY = "MAD";

/**
 * Builds a GA4 `items` entry from a catalog product. Shared by every ecommerce
 * event (view_item, add_to_cart, view_cart, begin_checkout…) so the item shape
 * stays identical across the funnel — GA4 only joins them if they match.
 */
export function toAnalyticsItem(
  product: { id: string; name: string; category?: string | null; price?: number | null },
  extra: { quantity?: number; index?: number; item_list_name?: string } = {},
): AnalyticsItem {
  return {
    item_id: product.id,
    item_name: product.name,
    ...(product.category ? { item_category: product.category } : {}),
    ...(typeof product.price === "number" ? { price: product.price } : {}),
    ...extra,
  };
}

/**
 * Ecommerce convenience wrapper: stamps the currency and rounds `value` to the
 * 2 decimals GA4 expects. Use it for any event that carries a monetary value.
 */
export function trackEcommerce(
  action: string,
  params: {
    value?: number;
    items?: AnalyticsItem[];
    [key: string]: GtagScalar | AnalyticsItem[];
  },
): void {
  const { value, items, ...rest } = params;
  trackEvent(action, {
    ...rest,
    currency: ANALYTICS_CURRENCY,
    ...(typeof value === "number" ? { value: Math.round(value * 100) / 100 } : {}),
    ...(items ? { items } : {}),
  });
}

/**
 * Debug mode. Inlined at build time from NEXT_PUBLIC_ANALYTICS_DEBUG, and only
 * ever honoured outside production (see shouldLogAnalyticsToConsole) — it makes
 * events INSPECTABLE, it never makes them sendable.
 */
const ANALYTICS_DEBUG = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";

export function trackEvent(action: string, params: GtagParams = {}): void {
  if (typeof window === "undefined") return;

  // Local inspection. Deliberately BEFORE the gtag check: in development gtag is
  // never present (consent gates it, and analytics is production-only), so
  // logging afterwards would print nothing — which is exactly when a developer
  // needs to see the payload. Never logs in production.
  if (ANALYTICS_DEBUG && process.env.NODE_ENV !== "production") {
    console.info(`[analytics] ${action}`, params);
  }

  const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
  // Absent until AnalyticsConsentProvider injects it, which happens only after
  // the visitor grants consent — so this single check is also the consent gate
  // for every call site, and no caller needs to know about consent at all.
  if (typeof gtag !== "function") return;
  try {
    gtag("event", action, params);
  } catch {
    // Analytics must never break the UI.
  }
}
