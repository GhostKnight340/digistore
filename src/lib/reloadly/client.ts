/**
 * Minimal Reloadly REST client (OAuth2 client-credentials auth). This is the
 * ONLY module allowed to read Reloadly credentials and the ONLY module
 * allowed to build the `Authorization` header. Nothing here may log the
 * client secret or an access token — error paths only ever surface the HTTP
 * status and a server-provided message string.
 *
 * Foundation only: nothing in this file is wired into order fulfillment yet.
 */
import "server-only";
import {
  RELOADLY_AUTH_URL,
  getReloadlyClientId,
  getReloadlyClientSecret,
  isReloadlyConfigured,
} from "./config";

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

async function fetchAccessToken(audience: string): Promise<TokenCacheEntry> {
  const clientId = getReloadlyClientId();
  const clientSecret = getReloadlyClientSecret();
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

async function getAccessToken(audience: string): Promise<string> {
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  const fresh = await fetchAccessToken(audience);
  tokenCache.set(audience, fresh);
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
): Promise<T> {
  if (!isReloadlyConfigured()) {
    throw new ReloadlyConfigError(
      "Reloadly is not configured (missing RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET).",
    );
  }

  const token = await getAccessToken(baseUrl);

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
