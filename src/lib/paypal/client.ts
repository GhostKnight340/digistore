/**
 * Minimal PayPal REST client (Orders API v2 + OAuth2 client-credentials
 * auth + webhook signature verification). This is the ONLY module allowed
 * to read PayPal server-side credentials and the ONLY module allowed to
 * build the `Authorization` header. Nothing here may log the client secret,
 * an access token, or a raw webhook payload — error paths only ever surface
 * the HTTP status and a server-provided message string.
 */
import "server-only";
import {
  getPayPalApiBaseUrl,
  getPayPalClientId,
  getPayPalClientSecret,
  getPayPalWebhookId,
  isPayPalConfigured,
} from "./config";

export class PayPalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PayPalApiError";
    this.status = status;
  }
}

export class PayPalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigError";
  }
}

type TokenCacheEntry = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

let tokenCache: TokenCacheEntry | null = null;

// Refresh a little before the real expiry so an in-flight request never
// races the token's actual cutoff.
const TOKEN_REFRESH_SKEW_MS = 60_000;

async function fetchAccessToken(): Promise<TokenCacheEntry> {
  const clientId = getPayPalClientId();
  const clientSecret = getPayPalClientSecret();
  if (!clientId || !clientSecret) {
    throw new PayPalConfigError(
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured.",
    );
  }

  const response = await fetch(`${getPayPalApiBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const detail = await safeReadErrorDetail(response);
    throw new PayPalApiError(
      `PayPal token request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
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

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return tokenCache.accessToken;
  }
  const fresh = await fetchAccessToken();
  tokenCache = fresh;
  return fresh.accessToken;
}

type PayPalRequestInit = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Adds a PayPal-Request-Id idempotency header (order creation only). */
  requestId?: string;
};

async function paypalRequest<T>(path: string, init: PayPalRequestInit = {}): Promise<T> {
  if (!isPayPalConfigured()) {
    throw new PayPalConfigError(
      "PayPal is not configured (missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID).",
    );
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;

  const response = await fetch(`${getPayPalApiBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    const detail = await safeReadErrorDetail(response);
    throw new PayPalApiError(
      `PayPal API ${init.method ?? "GET"} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function safeReadErrorDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as {
      message?: string;
      name?: string;
      details?: { issue?: string; description?: string }[];
    };
    const issue = data.details?.[0];
    return data.message ?? issue?.description ?? issue?.issue ?? data.name ?? null;
  } catch {
    return null;
  }
}

// ─── Orders API v2 ──────────────────────────────────────────────────────────

export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount: PayPalMoney;
  final_capture?: boolean;
}

export interface PayPalOrder {
  id: string;
  status: string;
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: PayPalMoney;
    payments?: {
      captures?: PayPalCapture[];
    };
  }[];
  links?: { rel: string; href: string; method: string }[];
}

export interface CreatePayPalOrderInput {
  /** Ghost order id — round-tripped as PayPal's custom_id for reconciliation. */
  ghostOrderId: string;
  /** Decimal string amount, e.g. "19.99". */
  amountValue: string;
  /** ISO 4217 currency code PayPal will settle in (MAD is not supported). */
  currency: string;
  description?: string;
}

export async function createPayPalOrder(input: CreatePayPalOrderInput): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: `ghost-order-${input.ghostOrderId}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.ghostOrderId,
          custom_id: input.ghostOrderId,
          description: input.description,
          amount: {
            currency_code: input.currency,
            value: input.amountValue,
          },
        },
      ],
    },
  });
}

export async function getPayPalOrder(paypalOrderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(
    `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    { method: "POST", requestId: `ghost-capture-${paypalOrderId}` },
  );
}

export async function getPayPalCapture(captureId: string): Promise<PayPalCapture> {
  return paypalRequest<PayPalCapture>(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
}

// ─── Webhook signature verification ────────────────────────────────────────

export interface WebhookVerificationHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

/**
 * Verifies a webhook event via PayPal's verify-webhook-signature API — the
 * only trustworthy way to authenticate an inbound webhook. Never trust the
 * payload without a "SUCCESS" result from this call.
 */
export async function verifyPayPalWebhookSignature(
  headers: WebhookVerificationHeaders,
  rawBody: unknown,
): Promise<boolean> {
  const webhookId = getPayPalWebhookId();
  if (!webhookId) {
    throw new PayPalConfigError("PAYPAL_WEBHOOK_ID is not configured.");
  }

  const result = await paypalRequest<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        cert_url: headers.certUrl,
        auth_algo: headers.authAlgo,
        transmission_sig: headers.transmissionSig,
        webhook_id: webhookId,
        webhook_event: rawBody,
      },
    },
  );

  return result.verification_status === "SUCCESS";
}
