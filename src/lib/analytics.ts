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
