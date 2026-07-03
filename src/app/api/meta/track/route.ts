import { NextResponse } from "next/server";
import { requestUserData, sendMetaEvent } from "@/lib/meta/capi";
import { getCurrentCustomer } from "@/lib/auth";
import {
  META_EVENT_NAMES,
  type MetaContentItem,
  type MetaCustomData,
  type MetaEventName,
} from "@/lib/meta/events";

export const runtime = "nodejs";

// Server-authoritative events are sent to CAPI directly by server actions;
// accepting them here would let a stray client call double-report revenue.
const RELAY_BLOCKED_EVENTS = new Set(["Purchase", "CompleteRegistration"]);

function cleanString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function cleanContents(value: unknown): MetaContentItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const contents = value
    .slice(0, 50)
    .map((item): MetaContentItem | null => {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const id = cleanString(record.id, 128);
      if (!id) return null;
      return {
        id,
        quantity: cleanNumber(record.quantity),
        item_price: cleanNumber(record.item_price),
      };
    })
    .filter((item): item is MetaContentItem => item !== null);
  return contents.length > 0 ? contents : undefined;
}

/** Whitelist the custom_data keys the browser is allowed to relay. */
function cleanCustomData(value: unknown): MetaCustomData {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const contentIds = Array.isArray(record.content_ids)
    ? record.content_ids
        .slice(0, 50)
        .map((id) => cleanString(id, 128))
        .filter((id): id is string => Boolean(id))
    : undefined;
  return {
    content_ids: contentIds && contentIds.length > 0 ? contentIds : undefined,
    content_name: cleanString(record.content_name, 300),
    content_category: cleanString(record.content_category, 200),
    content_type: record.content_type === "product" ? "product" : undefined,
    contents: cleanContents(record.contents),
    value: cleanNumber(record.value),
    num_items: cleanNumber(record.num_items),
    search_string: cleanString(record.search_string, 200),
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventName = cleanString(body.eventName, 64);
  const eventId = cleanString(body.eventId, 128);
  if (
    !eventName ||
    !eventId ||
    !META_EVENT_NAMES.has(eventName) ||
    RELAY_BLOCKED_EVENTS.has(eventName)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const customer = await getCurrentCustomer().catch(() => null);
  await sendMetaEvent({
    eventName: eventName as MetaEventName,
    eventId,
    eventSourceUrl: cleanString(body.eventSourceUrl, 2048) ?? null,
    userData: {
      ...(await requestUserData()),
      email: customer?.email ?? null,
      externalId: customer?.id ?? null,
    },
    customData: cleanCustomData(body.customData),
  });

  return NextResponse.json({ ok: true });
}
