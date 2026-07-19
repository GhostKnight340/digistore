/**
 * FazerCards ⇄ Ghost.ma normalization boundary.
 *
 * Three responsibilities, deliberately kept together because they are the only
 * places provider-shaped data crosses into our domain:
 *
 *  1. {@link toNormalizedError}  — FazerCards errors → the shared taxonomy.
 *  2. {@link extractDeliveryFields} — completed-order payload → DeliveredFieldDTO[].
 *  3. {@link sanitizeProviderSnapshot} — response → auditable, secret-free JSON.
 *
 * ⚠️ UNVERIFIED CONTRACT — read before changing (2) ⚠️
 * ────────────────────────────────────────────────────────────────────────────
 * The official OpenAPI spec types the order object as
 * `{"type":"object","additionalProperties":true}` on BOTH `GET /orders/{id}`
 * and `POST /giftcards/order`, and the published docs contain no completed-order
 * example. There is therefore NO documented answer to "which field carries the
 * delivered gift-card code", and we have no API key to discover it empirically.
 *
 * {@link extractDeliveryFields} is consequently a tolerant scan over the shapes
 * a reseller API plausibly uses, NOT a contract implementation. It is written to
 * FAIL LOUDLY (return an empty array, which the caller turns into a hard error
 * and a manual-fulfilment instruction) rather than deliver an empty payload to a
 * paying customer.
 *
 * TO FINALISE: place one cheap real order, capture the raw JSON of
 * `GET /orders/{id}`, paste it into test/fazercards/payloadShapes.test.ts as a
 * fixture, and narrow this function to the real shape. Until then FazerCards
 * must not be marked production-ready — see docs/fazercards-integration.md
 * § Open questions.
 */
import type { DeliveredFieldDTO } from "@/lib/dto";
import {
  FazerCardsApiError,
  FazerCardsConfigError,
  isFazerCardsNetworkError,
} from "./client";
import {
  NormalizedSupplierError,
  classifySupplierHttpError,
  type SupplierErrorCode,
} from "@/lib/suppliers/errors";

/** Maps any error thrown by the FazerCards client onto the shared taxonomy. */
export function toNormalizedError(error: unknown): NormalizedSupplierError {
  if (error instanceof NormalizedSupplierError) return error;

  if (error instanceof FazerCardsConfigError) {
    return new NormalizedSupplierError("auth_failed", { message: error.message });
  }

  if (error instanceof FazerCardsApiError) {
    const code = classifySupplierHttpError({
      status: error.status,
      providerCode: error.code,
    });
    return new NormalizedSupplierError(code, {
      providerCode: error.code,
      httpStatus: error.status,
      retryAfterSec: error.retryAfterSec,
    });
  }

  if (isFazerCardsNetworkError(error)) {
    return new NormalizedSupplierError("timeout_uncertain", {
      message:
        "FazerCards n’a pas répondu (délai dépassé ou réseau). L’achat a peut-être abouti.",
    });
  }

  return new NormalizedSupplierError("unknown", {
    message: error instanceof Error ? error.message : undefined,
  });
}

/**
 * Terminal-success statuses. The docs never enumerate the vocabulary, so we
 * match tolerantly and treat anything unrecognised as still-processing rather
 * than as success — an unknown status must never trigger delivery.
 */
export function isTerminalSuccessStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return /^(completed|complete|success|succeeded|delivered|done|fulfilled)$/i.test(
    status.trim(),
  );
}

/** Terminal-failure statuses. Also matched tolerantly. */
export function isTerminalFailureStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return /^(failed|failure|error|cancelled|canceled|rejected|refunded|expired)$/i.test(
    status.trim(),
  );
}

/** Maps a raw FazerCards order status onto a normalized error code. */
export function failureCodeForStatus(status: string | null | undefined): SupplierErrorCode {
  const s = (status || "").toLowerCase();
  if (/refund/.test(s)) return "order_failed";
  if (/cancel/.test(s)) return "order_failed";
  return "order_failed";
}

const SECRET_KEYS =
  /^(code|codes|pin|pin_code|key|keys|serial|redeem_code|redeem_url|card_number|secret|token|password|login|api_key|authorization)$/i;

/**
 * Produces an audit-safe snapshot of a provider response: structure preserved,
 * secret-bearing values replaced by a masked marker.
 *
 * Keeping the *shape* is the point — it is what lets us diagnose "why did the
 * parser not find a code?" without ever storing the code itself. Depth and
 * size are bounded so a pathological response cannot bloat the row.
 */
export function sanitizeProviderSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeProviderSnapshot(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(key)) {
        // Record that the field existed and its type — never the value. This
        // is exactly the signal needed to finalise extractDeliveryFields().
        out[key] = Array.isArray(entry)
          ? `[masked array(${entry.length})]`
          : `[masked ${typeof entry}]`;
        continue;
      }
      out[key] = sanitizeProviderSnapshot(entry, depth + 1);
    }
    return out;
  }
  return "[unserializable]";
}

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Extracts delivered credentials from a completed FazerCards order.
 *
 * See the UNVERIFIED CONTRACT warning at the top of this file before editing.
 * Returns [] when nothing recognisable is found — callers MUST treat that as a
 * hard failure requiring manual fulfilment, never as "delivered nothing".
 */
export function extractDeliveryFields(order: Record<string, unknown>): DeliveredFieldDTO[] {
  const fields: DeliveredFieldDTO[] = [];

  const pushValue = (raw: unknown) => {
    const asString = trimmed(raw);
    if (asString) {
      fields.push(looksLikeUrl(asString) ? { url: asString } : { code: asString });
      return;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;

    const item = raw as Record<string, unknown>;
    const field: DeliveredFieldDTO = {};
    const code =
      trimmed(item.code) ??
      trimmed(item.key) ??
      trimmed(item.serial) ??
      trimmed(item.redeem_code) ??
      trimmed(item.card_number) ??
      trimmed(item.voucher) ??
      trimmed(item.value);
    const pin = trimmed(item.pin) ?? trimmed(item.pin_code);
    const url = trimmed(item.url) ?? trimmed(item.redeem_url) ?? trimmed(item.link);
    const instructions = trimmed(item.instructions) ?? trimmed(item.note);

    if (code) {
      if (!url && looksLikeUrl(code)) field.url = code;
      else field.code = code;
    }
    if (pin) field.pin = pin;
    if (url) field.url = url;
    if (instructions) field.instructions = instructions;
    if (field.code || field.pin || field.url) fields.push(field);
  };

  // Candidate containers: the order root plus the usual nesting wrappers.
  const containers: Record<string, unknown>[] = [order];
  for (const key of ["payload", "data", "result", "delivery", "content"]) {
    const nested = order[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      containers.push(nested as Record<string, unknown>);
    }
  }

  const LIST_KEYS = ["codes", "cards", "keys", "items", "gift_cards", "vouchers", "products"];
  for (const container of containers) {
    for (const key of LIST_KEYS) {
      const list = container[key];
      if (Array.isArray(list)) list.forEach(pushValue);
    }
  }

  // Single-code shapes ({ code: "…" } directly on a container) — only if no
  // list yielded anything, so we never mix a list with its own wrapper.
  if (fields.length === 0) {
    for (const container of containers) {
      pushValue(container);
      if (fields.length > 0) break;
    }
  }

  return fields;
}
