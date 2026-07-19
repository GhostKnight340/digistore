/**
 * Server-side GA4 events via the Measurement Protocol.
 *
 * Why server-side: the `purchase` event must fire exactly once, at the moment
 * the order really transitions to confirmed/delivered. Firing it from the
 * payment page would re-fire on every 5-second status poll and on every
 * refresh, inflating revenue. Sending it from the server at the transition
 * point, keyed on the ORDER ID as `transaction_id`, lets GA4 de-duplicate: a
 * replay can never create a second purchase.
 *
 * Hard rules (all enforced below):
 *  - Silent no-op when GA_API_SECRET or NEXT_PUBLIC_GA_ID is unset.
 *  - Silent no-op outside the real production runtime, so staging never
 *    pollutes the live property.
 *  - Never throws, never awaited by business logic — analytics must not be able
 *    to block or delay order fulfilment.
 *  - No PII: product ids/names and a monetary total only. Never an email, an
 *    order NUMBER (the opaque id is the dedup key, not a customer-facing
 *    reference), a digital code, an address or a payment proof.
 */
// Type-only import: src/lib/analytics.ts is a "use client" module, so its
// runtime exports are client references on the server. We share the SHAPE with
// the browser events (GA4 only joins items that match) but not the values.
import type { AnalyticsItem } from "@/lib/analytics";
import { isProductionRuntime } from "@/lib/env";

const ENDPOINT = "https://www.google-analytics.com/mp/collect";
/** Must stay identical to ANALYTICS_CURRENCY in src/lib/analytics.ts. */
const ANALYTICS_CURRENCY = "MAD";
/** The Measurement Protocol drops requests that take too long anyway. */
const SEND_TIMEOUT_MS = 2000;

export type PurchaseEventInput = {
  /** Internal order id — used verbatim as GA4's `transaction_id` (dedup key). */
  orderId: string;
  /** Server-recomputed order total in MAD. */
  totalMad: number;
  items: AnalyticsItem[];
  /** GA client id from the visitor's `_ga` cookie, when we have a request. */
  clientId?: string | null;
  /** Optional discount/shipping breakdown, all in MAD. */
  couponApplied?: boolean;
};

export type MeasurementPayload = {
  client_id: string;
  events: { name: string; params: Record<string, unknown> }[];
};

/**
 * Extracts the GA client id from a raw `_ga` cookie value.
 * Format is `GA1.1.<client_id>` where client_id is `<random>.<timestamp>`.
 * Returns null for anything unrecognised — we'd rather send a synthetic id
 * than a malformed one.
 */
export function parseGaClientId(rawGaCookie: string | undefined | null): string | null {
  if (!rawGaCookie) return null;
  const parts = rawGaCookie.split(".");
  if (parts.length < 4) return null;
  const clientId = `${parts[2]}.${parts[3]}`;
  return /^\d+\.\d+$/.test(clientId) ? clientId : null;
}

/**
 * A stable synthetic client id for events with no browser context (fulfilment
 * runs from a webhook or a cron job). Deterministic per order so retries land
 * on the same pseudo-user rather than inventing a new one each time.
 */
export function syntheticClientId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `${hash}.0`;
}

/** Reads the visitor's GA client id from the current request, if any. */
export async function currentGaClientId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return parseGaClientId(store.get("_ga")?.value);
  } catch {
    // No request context (cron, worker) — caller falls back to a synthetic id.
    return null;
  }
}

/** Measurement Protocol credentials, or null when analytics is not configured. */
export function measurementConfig(): { measurementId: string; apiSecret: string } | null {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  const apiSecret = process.env.GA_API_SECRET;
  if (!measurementId || !apiSecret) return null;
  return { measurementId, apiSecret };
}

/** Builds the exact JSON body sent to GA4 for a purchase. Pure — easy to test. */
export function buildPurchasePayload(input: PurchaseEventInput): MeasurementPayload {
  return {
    client_id: input.clientId || syntheticClientId(input.orderId),
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: input.orderId,
          currency: ANALYTICS_CURRENCY,
          value: Math.round(input.totalMad * 100) / 100,
          ...(input.couponApplied ? { coupon: "applied" } : {}),
          items: input.items,
        },
      },
    ],
  };
}

/**
 * POSTs a payload to the Measurement Protocol. Returns `true` only when the
 * request was actually attempted, so callers/tests can assert the no-op path.
 */
async function post(payload: MeasurementPayload): Promise<boolean> {
  const config = measurementConfig();
  if (!config) return false;
  if (!isProductionRuntime()) return false;

  const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(
    config.measurementId,
  )}&api_secret=${encodeURIComponent(config.apiSecret)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Analytics is best-effort; a GA outage must never surface to a customer.
  } finally {
    clearTimeout(timer);
  }
  return true;
}

/**
 * Fire-and-forget GA4 `purchase`. Call at the confirmed/delivered transition.
 * Never await this in a fulfilment path — it returns a promise only so tests
 * can settle it.
 */
export function sendPurchaseEvent(input: PurchaseEventInput): Promise<boolean> {
  try {
    return post(buildPurchasePayload(input));
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Fire-and-forget GA4 event for server actions (login, sign_up) where there is
 * no client-side hook to hang a gtag call on. Params must stay non-PII.
 */
export function sendServerEvent(
  name: string,
  params: Record<string, string | number | boolean> = {},
  clientId?: string | null,
): Promise<boolean> {
  try {
    return post({
      client_id: clientId || syntheticClientId(`${name}:${Date.now()}`),
      events: [{ name, params }],
    });
  } catch {
    return Promise.resolve(false);
  }
}
