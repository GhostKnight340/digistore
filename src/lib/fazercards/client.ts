/**
 * Minimal FazerCards REST client (X-API-Key auth). This is the ONLY module
 * allowed to read the FazerCards API key and the ONLY module allowed to build
 * the auth header. Nothing here may log the key — error paths only ever
 * surface the HTTP status and the server-provided `error`/`code` strings.
 *
 * API conventions (see docs/fazercards-integration.md):
 *  - every JSON response carries `ok: true` on success, or
 *    `{ ok: false, error, code? }` on failure (sometimes with HTTP 200);
 *  - order-creation endpoints accept an `Idempotency-Key` header;
 *  - HTTP 429 carries a `Retry-After` header (seconds).
 */
import "server-only";
import { getFazerCardsApiKey, getFazerCardsBaseUrl, isFazerCardsConfigured } from "./config";

export class FazerCardsApiError extends Error {
  status: number;
  /** Machine code from the API's `code` field, when provided. */
  code: string | null;
  /** Seconds to wait before retrying, from `Retry-After` on 429 responses. */
  retryAfterSec: number | null;
  constructor(
    message: string,
    status: number,
    options: { code?: string | null; retryAfterSec?: number | null } = {},
  ) {
    super(message);
    this.name = "FazerCardsApiError";
    this.status = status;
    this.code = options.code ?? null;
    this.retryAfterSec = options.retryAfterSec ?? null;
  }
}

export class FazerCardsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FazerCardsConfigError";
  }
}

/**
 * True when a fetch() rejected before any HTTP response arrived — DNS failure,
 * connection reset, TLS error, timeout, or abort — i.e. we never actually
 * reached FazerCards. These surface as a bare TypeError/AbortException rather
 * than a {@link FazerCardsApiError} (which only exists once a response came back).
 */
export function isFazerCardsNetworkError(error: unknown): boolean {
  if (error instanceof FazerCardsApiError || error instanceof FazerCardsConfigError) {
    return false;
  }
  // AbortSignal.timeout() rejects with name "TimeoutError" (NOT "AbortError",
  // which only covers an explicit controller.abort()) — both must match.
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return true;
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) return true;
  // undici wraps low-level socket failures (ECONNRESET, ENOTFOUND, ETIMEDOUT…)
  // in `error.cause` with a string `code`.
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string";
}

/**
 * Turn any error from a FazerCards call into a safe, credential-free message
 * for the admin UI, and log the real cause server-side under
 * `[fazercards:<context>]`. Typed errors already carry a safe message; anything
 * else is a network failure or an unexpected bug whose detail must never reach
 * the browser.
 */
export function describeFazerCardsError(context: string, error: unknown): string {
  if (error instanceof FazerCardsConfigError) return error.message;
  if (error instanceof FazerCardsApiError) {
    if (error.status === 429) {
      return "FazerCards limite le débit des requêtes — réessayez dans un instant.";
    }
    return error.message;
  }
  console.error(
    `[fazercards:${context}]`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  if (isFazerCardsNetworkError(error)) {
    return "FazerCards est injoignable (réseau ou délai dépassé). Réessayez dans un instant.";
  }
  return "Erreur lors de la communication avec FazerCards.";
}

type FazerCardsRequestInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Sent as `Idempotency-Key` — REQUIRED on every order-creation call. */
  idempotencyKey?: string;
  /** Overrides {@link FAZERCARDS_LOOKUP_TIMEOUT_MS} (order calls use longer). */
  timeoutMs?: number;
};

/** Read-only lookups (profile, balance, catalog, order status): fail fast. */
export const FAZERCARDS_LOOKUP_TIMEOUT_MS = 10_000;
/** Order placement: allow longer before giving up on the response. */
export const FAZERCARDS_ORDER_TIMEOUT_MS = 15_000;

/** Every successful FazerCards payload carries `ok: true`. */
type FazerCardsEnvelope = { ok: boolean; error?: string; code?: string };

/**
 * Authenticated request against the FazerCards public API. Rejects with
 * {@link FazerCardsApiError} on HTTP errors AND on `ok: false` bodies (the API
 * can signal business failures either way), so callers never have to check
 * `ok` themselves.
 */
export async function fazerCardsRequest<T extends FazerCardsEnvelope>(
  path: string,
  init: FazerCardsRequestInit = {},
): Promise<T> {
  const apiKey = getFazerCardsApiKey();
  if (!isFazerCardsConfigured() || !apiKey) {
    throw new FazerCardsConfigError("FazerCards is not configured (missing FAZERCARDS_API_KEY).");
  }

  const url = new URL(`${getFazerCardsBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? FAZERCARDS_LOOKUP_TIMEOUT_MS),
  });

  let data: (FazerCardsEnvelope & Record<string, unknown>) | null = null;
  try {
    data = (await response.json()) as FazerCardsEnvelope & Record<string, unknown>;
  } catch {
    // Non-JSON body (e.g. gateway error page) — fall through to status check.
  }

  if (!response.ok || !data || data.ok !== true) {
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterSec =
      response.status === 429 && retryAfterRaw != null && Number.isFinite(Number(retryAfterRaw))
        ? Number(retryAfterRaw)
        : null;
    throw new FazerCardsApiError(
      `FazerCards API ${init.method ?? "GET"} ${path} failed with status ${response.status}${
        data?.error ? `: ${data.error}` : ""
      }`,
      response.status,
      { code: data?.code ?? null, retryAfterSec },
    );
  }

  return data as T;
}
