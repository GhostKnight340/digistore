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
import { fazerCardsRequest, FAZERCARDS_ORDER_TIMEOUT_MS } from "./client";

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
    timeoutMs: FAZERCARDS_ORDER_TIMEOUT_MS,
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
    timeoutMs: FAZERCARDS_ORDER_TIMEOUT_MS,
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

/** `GET /orders?page&limit` — paginated history, newest first. */
export async function listOrders(options?: {
  page?: number;
  limit?: number;
}): Promise<{ ok: true; items: FazerCardsOrder[]; total: number; page: number; limit: number }> {
  return fazerCardsRequest("/orders", {
    query: { page: options?.page, limit: options?.limit ?? 50 },
  });
}

/**
 * Best-effort lookup of the order created under a given idempotency key, for
 * reconciling a purchase whose response we never received.
 *
 * ⚠️ Limitation, stated plainly: the API exposes NO documented way to query an
 * order by idempotency key. `GET /orders` has no such filter, and the order
 * object is untyped so we cannot rely on the key being echoed back. The only
 * documented replay mechanism is re-POSTing the identical body with the same
 * key — which we deliberately do NOT do here, because reconstructing that body
 * incorrectly would place a real second order, the exact failure this module
 * exists to prevent.
 *
 * So this scans recent order history and matches on any field that carries our
 * key verbatim. It returns:
 *   - the order, when a confident match is found;
 *   - null, when the history was read successfully and nothing matched
 *     (⇒ caller may treat the slot as cleanly failed);
 * and it THROWS when history could not be read, so an API outage is never
 * mistaken for "no order exists".
 *
 * Narrow this once a real order confirms whether the key is echoed — see
 * docs/fazercards-integration.md § Open questions.
 */
export async function replayOrderByIdempotencyKey(input: {
  idempotencyKey: string;
  serviceType: string | null;
  /** How many pages of history to scan before giving up. */
  maxPages?: number;
}): Promise<FazerCardsOrder | null> {
  const maxPages = input.maxPages ?? 3;
  const needle = input.idempotencyKey;

  for (let page = 1; page <= maxPages; page += 1) {
    const history = await listOrders({ page, limit: 50 });
    const items = Array.isArray(history.items) ? history.items : [];
    if (items.length === 0) return null;

    for (const order of items) {
      // Match the key anywhere in the order object — it may surface as
      // `idempotency_key`, `reference`, `external_id`, or not at all.
      if (orderCarriesReference(order, needle)) return order;
    }

    if (items.length < 50) return null; // last page reached
  }
  return null;
}

/** True when any string field of the order equals the reference. */
function orderCarriesReference(order: FazerCardsOrder, reference: string): boolean {
  for (const value of Object.values(order)) {
    if (typeof value === "string" && value === reference) return true;
  }
  return false;
}

// ── Game keys ────────────────────────────────────────────────────────────────

export type FazerCardsGame = {
  game_id: string;
  name: string;
  platform?: string;
};

export async function getGames(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{ ok: true; items: FazerCardsGame[]; meta: CursorMeta }> {
  return fazerCardsRequest("/gamekeys", {
    query: { limit: options?.limit, cursor: options?.cursor },
  });
}

export type FazerCardsGameKeyOffer = {
  key_id: string;
  name: string;
  price_usd: string;
  stock: number;
  platform?: string;
  region?: string;
};

export async function getGameKeyOffers(gameId: string): Promise<{
  ok: true;
  game_id: string;
  name: string;
  offers: FazerCardsGameKeyOffer[];
}> {
  return fazerCardsRequest("/gamekeys/keys", { query: { game_id: gameId } });
}

/** Activation-region restrictions for a game, when the API reports any. */
export async function getGameKeyRegionRestriction(gameId: string): Promise<{
  ok: true;
  game_id: string;
  restriction?: string;
  regions?: string[];
}> {
  return fazerCardsRequest("/gamekeys/region-restriction", { query: { game_id: gameId } });
}

/** Places a REAL game-key order (spends wallet balance; no sandbox). */
export async function placeGameKeyOrder(input: {
  gameId: string;
  keyId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest("/gamekeys/order", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    timeoutMs: FAZERCARDS_ORDER_TIMEOUT_MS,
    body: {
      game_id: input.gameId,
      key_id: input.keyId,
      quantity: input.quantity,
    },
  });
}

// ── Steam wallet top-ups ─────────────────────────────────────────────────────
// Distinct from Steam GIFTS below: a wallet top-up credits an existing Steam
// account identified by its login, whereas a gift sends a specific game to a
// profile via an invite URL. They share no identifiers and are not
// interchangeable.

export type FazerCardsSteamRate = {
  currency: string;
  rate: string;
  min_amount?: string;
  max_amount?: string;
};

export async function getSteamTopupRates(): Promise<{
  ok: true;
  rates: FazerCardsSteamRate[];
}> {
  return fazerCardsRequest("/steam-topup/rates");
}

/** Read-only pre-check that a Steam login can actually receive a top-up. */
export async function checkSteamLogin(steamLogin: string): Promise<{
  ok: true;
  steamLogin: string;
  can_refill: boolean;
  reason?: string;
}> {
  return fazerCardsRequest("/steam-topup/check-login", {
    method: "POST",
    body: { steamLogin },
  });
}

/** Places a REAL Steam wallet top-up. */
export async function placeSteamTopupOrder(input: {
  steamLogin: string;
  currency: string;
  amount: string;
  idempotencyKey: string;
}): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest("/steam-topup/order", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    timeoutMs: FAZERCARDS_ORDER_TIMEOUT_MS,
    body: {
      steamLogin: input.steamLogin,
      currency: input.currency,
      amount: input.amount,
    },
  });
}

// ── Steam gifts ──────────────────────────────────────────────────────────────

export type FazerCardsSteamGame = {
  appid: number;
  name: string;
  price_usd?: string;
  region?: string;
  sub_id?: number;
};

export async function getSteamGiftGames(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{ ok: true; items: FazerCardsSteamGame[]; meta: CursorMeta }> {
  return fazerCardsRequest("/steam-gifts/games", {
    query: { limit: options?.limit, cursor: options?.cursor },
  });
}

export async function getSteamGiftGame(appid: number): Promise<{
  ok: true;
  game: FazerCardsSteamGame & Record<string, unknown>;
}> {
  return fazerCardsRequest(`/steam-gifts/games/${encodeURIComponent(String(appid))}`);
}

/** Places a REAL Steam gift order to a profile invite URL. */
export async function placeSteamGiftOrder(input: {
  inviteUrl: string;
  subId: number;
  appId: number;
  region: string;
  idempotencyKey: string;
}): Promise<{ ok: true; order: FazerCardsOrder }> {
  return fazerCardsRequest("/steam-gifts/order", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    timeoutMs: FAZERCARDS_ORDER_TIMEOUT_MS,
    body: {
      invite_url: input.inviteUrl,
      sub_id: input.subId,
      app_id: input.appId,
      region: input.region,
    },
  });
}
