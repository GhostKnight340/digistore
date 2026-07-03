// Browser-side Meta Pixel helpers.
//
// Every pixel event carries an eventID and (for browser-originated events) is
// mirrored to the Conversions API via /api/meta/track with the same id, so
// Meta deduplicates the pair. Server-authoritative events (Purchase,
// CompleteRegistration) are sent to CAPI by the server action instead; the
// browser only fires the pixel half with the shared deterministic id.

import {
  META_CUSTOM_EVENTS,
  newMetaEventId,
  type MetaCustomData,
  type MetaEventName,
} from "./events";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      push?: (...args: unknown[]) => void;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  }
}

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function isMetaPixelEnabled(): boolean {
  return Boolean(META_PIXEL_ID) && typeof window !== "undefined";
}

let pixelInitialized = false;

/**
 * Install the fbq queue stub, load the pixel script and init the pixel.
 * Idempotent; called lazily before the first event so init always precedes
 * track calls regardless of component mount order.
 */
export function ensureMetaPixel(): boolean {
  if (!isMetaPixelEnabled()) return false;
  if (pixelInitialized) return true;

  if (!window.fbq) {
    const fbq: NonNullable<Window["fbq"]> = (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  window.fbq("init", META_PIXEL_ID);
  pixelInitialized = true;
  return true;
}

function firePixel(eventName: MetaEventName, customData: MetaCustomData, eventId: string) {
  window.fbq?.(
    META_CUSTOM_EVENTS.has(eventName) ? "trackCustom" : "track",
    eventName,
    customData,
    { eventID: eventId },
  );
}

function relayToCapi(eventName: MetaEventName, customData: MetaCustomData, eventId: string) {
  try {
    void fetch("/api/meta/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: window.location.href,
        customData,
      }),
    }).catch(() => {});
  } catch {
    // Tracking must never break the UI.
  }
}

/**
 * Fire a browser event on both channels: Meta Pixel + Conversions API relay,
 * sharing one event id for deduplication. Returns the event id used.
 */
export function trackMetaEvent(
  eventName: MetaEventName,
  customData: MetaCustomData = {},
  eventId: string = newMetaEventId(),
): string {
  if (!ensureMetaPixel()) return eventId;
  firePixel(eventName, customData, eventId);
  relayToCapi(eventName, customData, eventId);
  return eventId;
}

/**
 * Fire only the pixel half of an event whose CAPI half is sent by the server
 * (Purchase, CompleteRegistration). The caller must pass the same
 * deterministic event id the server used.
 */
export function trackMetaPixelOnly(
  eventName: MetaEventName,
  customData: MetaCustomData,
  eventId: string,
): void {
  if (!ensureMetaPixel()) return;
  firePixel(eventName, customData, eventId);
}
