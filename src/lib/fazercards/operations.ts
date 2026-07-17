/**
 * Domain-level FazerCards operations. This is the surface other code should
 * import from. Field-level shapes follow the public docs + OpenAPI spec
 * (https://api.fzr.cards/public/docs); the completed-order payload is untyped
 * in the spec, so `FazerCardsOrder.payload` stays a loose record until a real
 * order has been captured (see docs/fazercards-integration.md § Open questions).
 *
 * Catalog conventions: snake_case fields, USD decimal-string prices
 * (`price_usd: "10.5000"`), cursor pagination via `meta.next_cursor`.
 */
import "server-only";
import { fazerCardsRequest } from "./client";

// ── Shared shapes ────────────────────────────────────────────────────────────

type CursorMeta = {
  total: number;
  limit: number;
  next_cursor: string | null;
  has_more: boolean;
};

/** `GET /orders/:id` — `kind`/`status`/payload vary per product family.
 *  Statuses observed in docs: "processing", "completed", "created"; treat the
 *  vocabulary as open until confirmed with live orders. */
export type FazerCardsOrder = {
  id: string; // "ord-9001"
  kind: string; // "gift_card" | "topup" | "game_key" | …
  status: string;
} & Record<string, unknown>;

// ── Account ──────────────────────────────────────────────────────────────────

export type FazerCardsProfile = {
  ok: true;
  login: string;
  email: string;
  plan: string;
  planExpiresAt: string | null;
  planAutoRenew: boolean;
  subscriptionActive: boolean;
  summary: { totalSpent: string; totalOrders: number };
};

/** Profile + subscription state. Read-only; used by the admin health check. */
export async function getProfile(): Promise<FazerCardsProfile> {
  return fazerCardsRequest<FazerCardsProfile>("/me");
}

export type FazerCardsBalance = {
  ok: true;
  /** Decimal string, e.g. "100.0000". */
  balance: string;
  currency: "USD" | string;
};

/** Wallet balance in USD. Read-only and safe for admin overviews. */
export async function getBalance(): Promise<FazerCardsBalance> {
  return fazerCardsRequest<FazerCardsBalance>("/balance");
}

// ── Gift cards ───────────────────────────────────────────────────────────────

export type FazerCardsGiftCardCategory = {
  category_id: string;
  name: string;
};

export async function getGiftCardCategories(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{ ok: true; items: FazerCardsGiftCardCategory[]; meta: CursorMeta }> {
  return fazerCardsRequest("/giftcards", {
    query: { limit: options?.limit, cursor: options?.cursor },
  });
}

export type FazerCardsGiftCardOffer = {
  card_id: string;
  name: string;
  /** Supplier cost in USD as a decimal string, e.g. "10.5000". */
  price_usd: string;
  stock: number;
  min_order_quantity: number;
  max_order_quantity: number;
};

export async function getGiftCardOffers(categoryId: string): Promise<{
  ok: true;
  category_id: string;
  name: string;
  offers: FazerCardsGiftCardOffer[];
}> {
  return fazerCardsRequest("/giftcards/cards", { query: { category_id: categoryId } });
}

/**
 * Places a REAL order and spends USD wallet balance — there is no sandbox.
 * `idempotencyKey` is mandatory here (derive it from our order + item ids) so
 * a retried delivery can never double-charge.
 */
export async function placeGiftCardOrder(input: {
  categoryId: string;
  cardId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest("/giftcards/order", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      category_id: input.categoryId,
      card_id: input.cardId,
      quantity: input.quantity,
    },
  });
}

// ── Game top-ups ─────────────────────────────────────────────────────────────

export type FazerCardsTopupCategory = {
  category_id: string;
  name: string;
  note?: string;
};

export async function getTopupCategories(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{ ok: true; items: FazerCardsTopupCategory[]; meta: CursorMeta }> {
  return fazerCardsRequest("/topups", {
    query: { limit: options?.limit, cursor: options?.cursor },
  });
}

/** Dynamic buyer-input field for a top-up (e.g. player_id). */
export type FazerCardsBuyerField = {
  key: string;
  label: string;
  type: string; // "text" observed; treat as open
};

export type FazerCardsTopupOffer = {
  offer_id: string;
  name: string;
  price_usd: string;
};

export async function getTopupOffers(categoryId: string): Promise<{
  ok: true;
  category_id: string;
  name: string;
  offers: FazerCardsTopupOffer[];
  fields: FazerCardsBuyerField[];
}> {
  return fazerCardsRequest("/topups/offers", { query: { category_id: categoryId } });
}

/**
 * Validates a player id before ordering (supported games only — see
 * `GET /topups/validate-id` for the list). Returns the in-game nickname on
 * success, which we can echo back to the buyer.
 */
export async function validatePlayerId(input: {
  categoryId: string;
  fields: Record<string, string>;
}): Promise<{ ok: true; category_id: string; valid: boolean; player_name?: string; region?: string }> {
  return fazerCardsRequest("/topups/validate-id", {
    method: "POST",
    body: { category_id: input.categoryId, fields: input.fields },
  });
}

/** Places a REAL top-up order (spends wallet balance; no sandbox). */
export async function placeTopupOrder(input: {
  categoryId: string;
  offerId: string;
  fields: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest("/topups/order", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      category_id: input.categoryId,
      offer_id: input.offerId,
      fields: input.fields,
    },
  });
}

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Full order by public id ("ord-…"). After an order leaves "processing",
 * completed gift-card orders are expected to carry the purchased codes in the
 * order body — exact field names TBC with a live key (spec leaves the order
 * object untyped).
 */
export async function getOrder(orderId: string): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest(`/orders/${encodeURIComponent(orderId)}`);
}
