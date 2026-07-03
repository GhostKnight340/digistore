// Shared Meta (Facebook) tracking definitions used by both the browser pixel
// and the server-side Conversions API. Keep this file client-safe: no Node or
// server-only imports.

/** All order values on ghost.ma are in Moroccan Dirham. */
export const META_CURRENCY = "MAD";

export type MetaStandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase"
  | "CompleteRegistration";

/** Non-standard events sent with fbq('trackCustom', ...). */
export type MetaCustomEvent = "ViewCategory";

export type MetaEventName = MetaStandardEvent | MetaCustomEvent;

export const META_CUSTOM_EVENTS: ReadonlySet<string> = new Set(["ViewCategory"]);

export const META_EVENT_NAMES: ReadonlySet<string> = new Set([
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
  "CompleteRegistration",
  "ViewCategory",
]);

export interface MetaContentItem {
  /** Storefront product id (product slug or variant id). */
  id: string;
  quantity?: number;
  /** Unit price in MAD. */
  item_price?: number;
}

/** Subset of Meta's custom_data parameters used by the store. */
export interface MetaCustomData {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  content_type?: "product";
  contents?: MetaContentItem[];
  currency?: string;
  value?: number;
  num_items?: number;
  search_string?: string;
  order_id?: string;
  status?: string;
}

/** Deterministic event id for a Purchase, shared by pixel and CAPI. */
export function purchaseEventId(orderId: string): string {
  return `purchase.${orderId}`;
}

/** Deterministic event id for a CompleteRegistration, shared by pixel and CAPI. */
export function registrationEventId(customerId: string): string {
  return `registration.${customerId}`;
}

/** Random event id for browser-initiated events (mirrored to CAPI for dedup). */
export function newMetaEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 12)}`;
}
