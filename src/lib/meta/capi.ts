// Server-side Meta Conversions API client.
//
// Events sent here mirror the browser pixel with the same event_id so Meta
// deduplicates them. The integration is a no-op unless both
// NEXT_PUBLIC_META_PIXEL_ID and META_CONVERSIONS_API_ACCESS_TOKEN are set, and
// it never throws: tracking must not break checkout or registration.
import "server-only";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { META_CURRENCY, type MetaCustomData, type MetaEventName } from "./events";

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Stable internal id (e.g. Customer.id), hashed before sending. */
  externalId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  /** Meta browser cookie (_fbp). */
  fbp?: string | null;
  /** Meta click cookie (_fbc). */
  fbc?: string | null;
}

export interface MetaServerEvent {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl?: string | null;
  userData?: MetaUserData;
  customData?: MetaCustomData;
}

function metaConfig(): { pixelId: string; accessToken: string } | null {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const accessToken = process.env.META_CONVERSIONS_API_ACCESS_TOKEN?.trim();
  if (!pixelId || !accessToken) return null;
  return { pixelId, accessToken };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashedEmail(email?: string | null): string[] | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized ? [sha256(normalized)] : undefined;
}

/** Meta expects digits only with country code; local Moroccan 0X → 212X. */
function hashedPhone(phone?: string | null): string[] | undefined {
  let digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return undefined;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) digits = `212${digits.slice(1)}`;
  return [sha256(digits)];
}

function hashedName(name?: string | null): string[] | undefined {
  const normalized = name?.trim().toLowerCase();
  return normalized ? [sha256(normalized)] : undefined;
}

/** Split a free-form full name into first / last for advanced matching. */
export function splitFullName(fullName?: string | null): {
  firstName?: string;
  lastName?: string;
} {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

/**
 * Collect browser signals (IP, user agent, _fbp/_fbc cookies) from the current
 * request. Works in both server actions and route handlers.
 */
export async function requestUserData(): Promise<MetaUserData> {
  try {
    const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
    const forwardedFor = headerList.get("x-forwarded-for");
    return {
      clientIpAddress:
        forwardedFor?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null,
      clientUserAgent: headerList.get("user-agent"),
      fbp: cookieStore.get("_fbp")?.value ?? null,
      fbc: cookieStore.get("_fbc")?.value ?? null,
    };
  } catch {
    return {};
  }
}

function buildUserData(userData: MetaUserData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const em = hashedEmail(userData.email);
  const ph = hashedPhone(userData.phone);
  const fn = hashedName(userData.firstName);
  const ln = hashedName(userData.lastName);
  if (em) payload.em = em;
  if (ph) payload.ph = ph;
  if (fn) payload.fn = fn;
  if (ln) payload.ln = ln;
  if (userData.externalId) payload.external_id = [sha256(userData.externalId)];
  if (userData.clientIpAddress) payload.client_ip_address = userData.clientIpAddress;
  if (userData.clientUserAgent) payload.client_user_agent = userData.clientUserAgent;
  if (userData.fbp) payload.fbp = userData.fbp;
  if (userData.fbc) payload.fbc = userData.fbc;
  return payload;
}

/**
 * Send one event to the Meta Conversions API. Fire-and-forget: failures are
 * logged and swallowed so tracking never impacts the user flow.
 */
export async function sendMetaEvent(event: MetaServerEvent): Promise<void> {
  const config = metaConfig();
  if (!config) return;

  const userData = buildUserData(event.userData ?? {});
  if (Object.keys(userData).length === 0) {
    // Meta rejects events without any customer information parameter.
    return;
  }

  const customData: MetaCustomData | undefined = event.customData
    ? { currency: META_CURRENCY, ...event.customData }
    : undefined;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: "website",
        ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
        user_data: userData,
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
  };
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[meta:capi]", event.eventName, response.status, detail.slice(0, 500));
    }
  } catch (error) {
    console.error("[meta:capi]", event.eventName, error);
  }
}
