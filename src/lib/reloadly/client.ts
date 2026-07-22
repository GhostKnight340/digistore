/**
 * Minimal Reloadly REST client (OAuth2 client-credentials auth). This is the
 * ONLY module allowed to read Reloadly credentials and the ONLY module
 * allowed to build the `Authorization` header. Nothing here may log the
 * client secret or an access token — error paths only ever surface the HTTP
 * status and a server-provided message string.
 *
 * Every outbound fetch carries an AbortSignal timeout — without one, undici
 * waits indefinitely and a hung supplier call would pin an order delivery (and
 * the admin request behind it) open forever. A timeout surfaces as an
 * AbortError, which {@link isReloadlyNetworkError} classifies as a network
 * failure.
 */
import "server-only";
import {
  RELOADLY_AUTH_URL,
  getReloadlyClientId,
  getReloadlyClientSecret,
  isReloadlyConfigured,
} from "./config";
import type { ReloadlyEnvironment } from "./config";

export class ReloadlyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReloadlyApiError";
    this.status = status;
  }
}

export class ReloadlyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReloadlyConfigError";
  }
}

/**
 * True when a fetch() rejected before any HTTP response arrived — DNS failure,
 * connection reset, TLS error, timeout, or abort — i.e. we never actually
 * reached Reloadly. These surface as a bare TypeError/AbortException rather than
 * a {@link ReloadlyApiError} (which only exists once a status code came back).
 */
export function isReloadlyNetworkError(error: unknown): boolean {
  if (error instanceof ReloadlyApiError || error instanceof ReloadlyConfigError) {
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
 * Turn any error from a Reloadly call into a safe, credential-free message for
 * the admin UI, and log the real cause server-side under `[reloadly:<context>]`.
 * Typed Reloadly errors already carry a safe message; anything else is a network
 * failure or an unexpected bug whose detail must never reach the browser.
 */
export function describeReloadlyError(context: string, error: unknown): string {
  if (error instanceof ReloadlyConfigError) return error.message;
  if (error instanceof ReloadlyApiError) return error.message;
  console.error(
    `[reloadly:${context}]`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  if (isReloadlyNetworkError(error)) {
    return "Reloadly est injoignable (réseau ou délai dépassé). Réessayez dans un instant.";
  }
  return "Erreur lors de la communication avec Reloadly.";
}

type TokenCacheEntry = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

// Cached per audience (base URL) — a token minted for one Reloadly product
// audience does not authenticate calls to another product's API.
const tokenCache = new Map<string, TokenCacheEntry>();

// Refresh a little before the real expiry so an in-flight request never
// races the token's actual cutoff.
const TOKEN_REFRESH_SKEW_MS = 60_000;

/** Auth + read-only lookups: fail fast, they are cheap and retryable. */
export const RELOADLY_LOOKUP_TIMEOUT_MS = 10_000;
/** Order placement: allow longer, the provider fulfils synchronously. */
export const RELOADLY_ORDER_TIMEOUT_MS = 15_000;

async function fetchAccessToken(audience: string, environment: ReloadlyEnvironment): Promise<TokenCacheEntry> {
  const clientId = getReloadlyClientId(environment);
  const clientSecret = getReloadlyClientSecret(environment);
  if (!clientId || !clientSecret) {
    throw new ReloadlyConfigError(
      "RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET are not configured.",
    );
  }

  const response = await fetch(RELOADLY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      audience,
    }),
    signal: AbortSignal.timeout(RELOADLY_LOOKUP_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await safeReadErrorDetail(response);
    throw new ReloadlyApiError(
      `Reloadly token request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getAccessToken(audience: string, environment: ReloadlyEnvironment): Promise<string> {
  const cacheKey = `${environment}:${audience}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  const fresh = await fetchAccessToken(audience, environment);
  tokenCache.set(cacheKey, fresh);
  return fresh.accessToken;
}

type ReloadlyRequestInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /**
   * Reloadly's Gift Cards API is content-negotiated: it 406s on a plain
   * `application/json` Accept header and requires this versioned media
   * type instead.
   */
  accept?: string;
  /** Overrides {@link RELOADLY_LOOKUP_TIMEOUT_MS} (order calls use longer). */
  timeoutMs?: number;
};

const GIFT_CARDS_ACCEPT = "application/com.reloadly.giftcards-v1+json";

/**
 * Authenticated request against a Reloadly product API. `baseUrl` doubles as
 * the OAuth2 audience for that product (see config.ts).
 */
export async function reloadlyRequest<T>(
  baseUrl: string,
  path: string,
  init: ReloadlyRequestInit = {},
  environment: ReloadlyEnvironment = "live",
): Promise<T> {
  if (!isReloadlyConfigured(environment)) {
    throw new ReloadlyConfigError(
      "Reloadly is not configured (missing RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET).",
    );
  }

  const token = await getAccessToken(baseUrl, environment);

  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: init.accept ?? GIFT_CARDS_ACCEPT,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? RELOADLY_LOOKUP_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await safeReadErrorDetail(response);
    throw new ReloadlyApiError(
      `Reloadly API ${init.method ?? "GET"} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function safeReadErrorDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { message?: string; errorCode?: string };
    return data.message ?? data.errorCode ?? null;
  } catch {
    return null;
  }
}
