/**
 * Domain-level Reloadly Gift Cards operations. This is the surface other
 * code should import from — nothing here is called by the production order
 * flow yet. Reloadly is a future optional supplier source per product
 * variant, not a replacement for local `DigitalCode` inventory.
 */
import "server-only";
import { getGiftCardsBaseUrl } from "./config";
import { reloadlyRequest } from "./client";

export type ReloadlyGiftCardProduct = {
  productId: number;
  productName: string;
  status: "ACTIVE" | "INACTIVE" | string;
  denominationType: "FIXED" | "RANGE" | string;
  recipientCurrencyCode: string;
  senderCurrencyCode: string;
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  fixedRecipientDenominations: number[];
  logoUrls: string[];
  country: { isoName: string; name: string; flagUrl: string };
  brand: { brandId: number; brandName: string; logoUrl: string };
  redeemInstruction: { concise: string; verbose: string };
};

// Reloadly returns a Spring-style page object — note `totalElements`, not
// `totalContent`.
type ReloadlyGiftCardProductsResponse = {
  content: ReloadlyGiftCardProduct[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
};

/**
 * Lists gift card products available from Reloadly, paginated.
 * Safe to call from an admin-only context to browse the catalog; not part
 * of any customer-facing or fulfillment path.
 */
export async function getGiftCardProducts(options?: {
  page?: number;
  size?: number;
  countryCode?: string;
}): Promise<ReloadlyGiftCardProductsResponse> {
  return reloadlyRequest<ReloadlyGiftCardProductsResponse>(
    getGiftCardsBaseUrl(),
    "/products",
    {
      query: {
        page: options?.page,
        size: options?.size,
        countryCode: options?.countryCode,
      },
    },
  );
}

export async function getGiftCardProduct(
  productId: number,
): Promise<ReloadlyGiftCardProduct> {
  return reloadlyRequest<ReloadlyGiftCardProduct>(
    getGiftCardsBaseUrl(),
    `/products/${productId}`,
  );
}

export type PlaceGiftCardOrderInput = {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  customIdentifier: string;
  senderName: string;
  recipientEmail: string;
};

// Verified 2026-07-07 against a real sandbox order (transactionId 72423):
// POST /orders returns the full transaction immediately, including status
// ("SUCCESSFUL" for an instantly-fulfilled order — no polling needed in the
// common case) and wallet balanceInfo. The redeem code itself is NOT in this
// response; it must be fetched separately via getGiftCardOrderCards().
export type ReloadlyGiftCardOrderResult = {
  transactionId: number;
  amount: number;
  discount: number;
  currencyCode: string;
  fee: number;
  status: "SUCCESSFUL" | "PROCESSING" | "PENDING" | "FAILED" | string;
  customIdentifier: string;
  transactionCreatedTime: string;
  product: {
    productId: number;
    productName: string;
    countryCode: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    currencyCode: string;
  };
  balanceInfo: {
    oldBalance: number;
    newBalance: number;
    cost: number;
    currencyCode: string;
  };
};

/**
 * Places a live/sandbox Reloadly order and spends from the Reloadly wallet.
 * NOT wired into deliverOrder() or any customer flow yet — exported for
 * future use once per-product supplier selection exists.
 */
export async function placeGiftCardOrder(
  input: PlaceGiftCardOrderInput,
): Promise<ReloadlyGiftCardOrderResult> {
  return reloadlyRequest<ReloadlyGiftCardOrderResult>(
    getGiftCardsBaseUrl(),
    "/orders",
    {
      method: "POST",
      body: input,
    },
  );
}

/**
 * Status/report lookup for a previously placed order. Verified endpoint:
 * `/reports/transactions/{id}` — NOT `/orders/transactions/{id}`, which
 * 404s despite appearing in some third-party writeups.
 */
export async function getGiftCardOrderStatus(
  transactionId: number,
): Promise<ReloadlyGiftCardOrderResult> {
  return reloadlyRequest<ReloadlyGiftCardOrderResult>(
    getGiftCardsBaseUrl(),
    `/reports/transactions/${transactionId}`,
  );
}

export type ReloadlyGiftCardOrderCard = {
  cardNumber: string | null;
  pinCode: string | null;
};

/**
 * Fetches the actual redeem code(s) for a completed order. Verified
 * endpoint: `GET /orders/transactions/{transactionId}/cards`. Only
 * meaningful once the order's status is "SUCCESSFUL" — call
 * getGiftCardOrderStatus() first if placeGiftCardOrder() didn't already
 * return that status synchronously.
 */
export async function getGiftCardOrderCards(
  transactionId: number,
): Promise<ReloadlyGiftCardOrderCard[]> {
  return reloadlyRequest<ReloadlyGiftCardOrderCard[]>(
    getGiftCardsBaseUrl(),
    `/orders/transactions/${transactionId}/cards`,
  );
}
