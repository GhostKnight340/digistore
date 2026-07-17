/**
 * Tiny shared helpers for normalizing provider payloads into
 * DeliveredFieldDTO[] — used by every provider implementation.
 */
import type { DeliveredFieldDTO } from "@/lib/dto";

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Compact human-readable value for the admin record (never shown in emails). */
export function primaryDeliveryValue(fields: DeliveredFieldDTO[]): string {
  return fields
    .map((field) => field.url ?? field.code ?? field.pin ?? "")
    .filter(Boolean)
    .join("\n");
}
