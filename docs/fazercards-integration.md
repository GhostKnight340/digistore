# FazerCards supplier integration — implementation prep

Research date: 2026-07-17. Sources: https://reseller.fazercards.com/en/docs (API
reference), /en/docs/webhooks, /en/docs/cookbook, and the OpenAPI spec at
https://api.fzr.cards/public/docs (JSON: /public/docs/openapi.json, 47 paths).

FazerCards is a reseller/supplier API (like Reloadly) for: game top-ups (PUBG
UC, Free Fire…), gift cards, game keys, Steam wallet top-ups & gifts, Telegram
Stars/Premium, and operator-fulfilled "manual services". We buy with a prepaid
USD wallet; codes/fulfillment come back through orders.

---

## 1. API essentials

- **Base URL**: `https://api.fzr.cards/api/v2`
- **Auth**: `X-API-Key: <key>` (or `Authorization: Bearer <key>`). Key created
  in the reseller hub (Profile). No sandbox/test mode documented — production
  only, so test with tiny orders.
- **Response envelope**: `{"ok": true, ...}` / `{"ok": false, "error": "...",
  "code": "optional_machine_code"}`.
- **Conventions**: catalog payloads are snake_case (`category_id`,
  `price_usd`); account payloads camelCase (`planExpiresAt`). Order ids look
  like `ord-123`, transactions `tx123`. Prices are **decimal strings in USD**.
- **Idempotency**: every order-creation endpoint accepts an
  `Idempotency-Key` header (≤255 chars, use a UUID). Same key ⇒ returns the
  original order, no double charge. **Always send one** (derive from our
  order-item id so retries are safe).
- **Rate limits** (per category, sliding window, HTTP 429 + `Retry-After`):
  catalog read 120/min · order create 60/min · order status 120/min ·
  account 30/min · payments 15/min. Recommended: respect Retry-After + ±15%
  jitter; cache catalog locally 5–15 min.
- **Errors**: 400 validation · 401 bad key · 403 account blocked / service not
  enabled for plan (product access depends on subscription tier) · 404 · 409
  conflict · 429 · 5xx retry-with-care.
- **Commercials to be aware of**: the account needs an active paid
  subscription (bronze $29 / silver $49 / gold $99 per 30 days) and a USD
  wallet balance funded by crypto (`POST /payments/create`, USDT TRC20/BEP20,
  TON, Binance Pay…). `GET /balance` → `{"balance": "100.0000"}`.
- **Official SDKs** exist (`npm install fazercards`, MIT) — but our repo
  pattern is a thin in-house client per provider (see `src/lib/reloadly/`), so
  plan to call REST directly and keep zero new dependencies.

## 2. Endpoints we care about (storefront-relevant subset)

### Gift cards (closest to our current catalog)
1. `GET /giftcards?limit=50` → categories `{category_id, name}` (cursor
   pagination via `meta.next_cursor`).
2. `GET /giftcards/cards?category_id=…` → offers:
   `{card_id, name, price_usd, stock, min_order_quantity, max_order_quantity}`.
3. `POST /giftcards/order` body `{category_id, card_id, quantity}` (qty 1–100)
   → `{order: {id: "ord-…", kind: "gift_card", status: "processing"}}`.

### Game top-ups (player-ID delivery, no code)
1. `GET /topups` → categories; `GET /topups/offers?category_id=…` → offers
   `{offer_id, name, price_usd}` **plus dynamic buyer `fields`**
   (e.g. `{key: "player_id", label: "Player ID", type: "text"}`).
2. `POST /topups/validate-id` (subset of games) → `{valid, player_name,
   region?}` — validate before ordering.
3. `POST /topups/order` body `{category_id, offer_id, fields: {player_id: …}}`.

### Game keys
`GET /gamekeys` → `GET /gamekeys/keys?game_id=…` (`key_id`, `price_usd`,
`stock`) → optional `GET /gamekeys/region-restriction?game_id=…` →
`POST /gamekeys/order` `{game_id, key_id, quantity}`.

### Steam / Telegram (later phases)
- Steam wallet: `GET /steam-topup/rates` (also key-less `/public-rates`),
  `POST /steam-topup/check-login` (`{steamLogin}` → `{can_refill}`),
  `POST /steam-topup/order` `{steamLogin, currency, amount}`.
- Steam gifts: games catalog → `POST /steam-gifts/order`
  `{invite_url, sub_id, app_id, region}`.
- Telegram: `POST /telegram/stars/buy` `{telegram_username, quantity 50–10000}`,
  `POST /telegram/premium/buy` `{telegram_username, months: 3|6|12}`.

### Orders & account
- `GET /orders?page&limit`, `GET /orders/:orderId` →
  `{order: {id, kind, status, payload…}}`. **The OpenAPI schema for the order
  object is `additionalProperties: true` (untyped) and the docs show no
  completed-order example — the exact field carrying delivered codes must be
  discovered empirically with a real key (see Open questions).**
- `GET /me`, `GET /balance`, `GET /transactions` (note `note: "Order ord-9001"`
  links a debit to an order — useful for cost reconciliation).

## 3. Webhooks (order completion push)

- Configure in the reseller hub (Settings → Webhook) **or** via API:
  `GET/PUT/DELETE /account/webhook` (`{url, enabled}`; GET also returns
  `secret`, `consecutive_failures`, `last_success_at`),
  `POST /account/webhook/secret/regenerate`, `POST /account/webhook/test`,
  `GET /account/webhook/deliveries`.
- Events: `order.created`, `order.status_changed` (e.g. processing →
  completed), `manual_service.chat.*`. (The cookbook also mentions
  `order.completed` / `order.failed` / `order.refunded` — naming inconsistency
  to verify against real deliveries.)
- Payload: `{event, event_id, timestamp, data: {order_id, type, …}}`.
- Signature: HMAC-SHA256 of the **raw request body** with the webhook secret,
  header `X-Webhook-Signature: sha256=<hex>` (cookbook shows
  `X-FazerCards-Signature` — check the real header at integration time; verify
  timing-safe).
- Delivery: expects 2xx within 10s; retries at 1min/5min/30min; auto-disables
  after 50 consecutive failures. Respond 200 fast, process async.

## 4. Documented vs cookbook discrepancies (verify with real key)

| Topic | API reference | Cookbook |
|---|---|---|
| Order endpoint | `POST /giftcards/order` | `POST /order` with `sku_id` |
| Signature header | `X-Webhook-Signature` | `X-FazerCards-Signature` |
| Event names | `order.status_changed` | `order.completed` etc. |

The API reference + OpenAPI spec agree with each other; treat the cookbook as
stale marketing copy until proven otherwise.

## 5. How it maps onto our codebase

We already have exactly one supplier integration to copy: **Reloadly**
(`src/lib/reloadly/{config,client,operations}.ts`). Fulfillment is
**admin-triggered** (payment confirmed → admin clicks "Livrer" →
`deliverOrder` in `src/lib/db/fulfillment.ts`), resolves provider purchases
*before* the DB transaction, then writes `DeliveredCode` rows and flips the
order to `delivered` with a `deliveryToken`.

Key differences FazerCards introduces vs Reloadly:

1. **Async fulfillment**: Reloadly completes within a short poll (3×1.5s).
   FazerCards orders return `status: "processing"` and may complete later →
   we need either longer polling, a webhook receiver, or a "pending
   fulfillment" state. **Recommendation for v1**: keep the admin-triggered
   flow, poll `GET /orders/:id` for up to ~30–60s; if still processing,
   record the provider order id on the item and finish delivery from the
   webhook/poll later (new small ledger table — see step 3 below — which also
   fixes the "no idempotency ledger" TODO in fulfillment.ts:186-199).
2. **Multiple product kinds**: gift cards (code-based) vs top-ups (player-id
   based, nothing to deliver except confirmation). Our checkout already has
   custom fields per product? (verify) — top-ups need the buyer's
   `player_id` captured at checkout and passed through to the order item.
3. **USD wallet economics**: `price_usd` is our supplier cost →
   `supplierCost/supplierCurrency` on `ProductVariant` + cost reconciliation
   like `recordReloadlyCostReconciliation`.

### Touch list (from the Reloadly template)

1. `src/lib/fazercards/config.ts` — env accessors: `FAZERCARDS_API_KEY`,
   `FAZERCARDS_WEBHOOK_SECRET` (optional `FAZERCARDS_BASE_URL` override).
   `isFazerCardsConfigured()`. No sandbox exists → no ENV switch; guard
   with an explicit `FAZERCARDS_ENABLED` flag if we want a kill switch.
2. `src/lib/fazercards/client.ts` — request wrapper: `X-API-Key` header,
   `ok:false` → `FazerCardsApiError(code, message, status)`, 429 handling
   honoring `Retry-After` (+jitter), `FazerCardsConfigError`,
   `describeFazerCardsError` (French admin-facing messages, same as
   `describeReloadlyError`).
3. **Prisma** — additive migration (file in `prisma/migrations/`, never bare
   `db push` — see docs/… drift incident 2026-07-17):
   - `ProductVariant`: `fazercardsCategoryId String?`,
     `fazercardsOfferId String?` (covers card_id/offer_id/key_id), extend the
     `stockControl` comment with `"fazercards"`.
   - `DeliveredCode`: allow `source = "fazercards"`,
     add `fazercardsOrderId String?`.
   - New `SupplierFulfillment` ledger (orderItemId, provider, providerOrderId,
     idempotencyKey, status, payload Json, timestamps) so processing orders
     survive restarts and retries never double-buy.
4. `src/lib/fazercards/operations.ts` — `getGiftCardCategories/Cards`,
   `getTopupCategories/Offers`, `validatePlayerId`, `placeGiftCardOrder`,
   `placeTopupOrder`, `getOrder`, `getBalance`. Cache catalog reads (5–15 min)
   to respect 120/min.
5. `src/lib/dto.ts` (~537) — extend `AssignmentEntry` union with a
   FazerCards discriminator (`fazercardsOfferId`…), mirroring
   `reloadlyProductId`.
6. `src/lib/db/fulfillment.ts` — the core seam:
   - pre-resolution: `resolveFazerCardsEntry` mirroring `resolveReloadlyEntry`
     (place order with Idempotency-Key, poll status, fetch payload);
   - transaction branch writing `DeliveredCode` with `source: "fazercards"`;
   - `normalizeFazerCardsPayload` → our generic
     `DeliveredFieldDTO {code?, pin?, url?, instructions?}` (customer page
     needs no changes if we map into this shape).
7. Webhook receiver — `src/app/api/webhooks/fazercards/route.ts`: verify
   HMAC (timing-safe, raw body), dedupe by `event_id` (reuse
   `PaymentWebhookEvent` pattern from the PayPal webhook), on
   `order.status_changed → completed` finish any pending
   `SupplierFulfillment` and deliver. Register the URL via
   `PUT /account/webhook` or the hub.
8. Admin UI:
   - `ProductsPanel.tsx` (~1493–1510): `stockControl` option "FazerCards" +
     category/offer id inputs (+ variant save paths).
   - `OrderDetailPage.tsx` (~1623–1730): "⚡ Via FazerCards" button + pre-
     delivery checks (balance, offer stock, price) like
     `getReloadlyDeliveryChecksAction`.
   - `SuppliersPanel` / `src/app/actions/suppliers.ts` /
     `src/lib/db/suppliers.ts`: health check (`GET /me` + `GET /balance`),
     mappings list, provider order lookups.
9. Optional later: catalog importer (like `ReloadlyImporter`), cost
   reconciliation in `src/lib/db/pricing.ts`, top-up player-id capture at
   checkout + `validate-id` pre-check, Steam/Telegram product kinds.

### Suggested phases

- **Phase 1 — plumbing + gift cards** (steps 1–6, 8a/8b): env vars, client,
  variant mapping, admin-triggered delivery with short poll; codes land in
  `DeliveredCode.deliveryPayload`. No webhook yet; a stuck "processing" order
  fails delivery cleanly (zero-writes) and can be retried thanks to the
  idempotency key.
- **Phase 2 — async completion**: `SupplierFulfillment` ledger + webhook
  receiver + a poller fallback (existing Vercel cron pattern in
  `vercel.json`).
- **Phase 3 — top-ups** (player-id fields at checkout, validate-id), then
  Steam wallet / Telegram if the catalog team wants them.

## 6. Open questions (need a real API key / account)

1. **Completed-order payload shape** — where exactly do gift-card codes/PINs
   appear in `GET /orders/:orderId` (`order.payload`?) and in the
   `order.status_changed` webhook `data`? OpenAPI leaves the order object
   untyped. → Place one cheap real order and capture the JSON before coding
   `normalizeFazerCardsPayload`.
2. **Webhook signature header** naming (`X-Webhook-Signature` vs
   `X-FazerCards-Signature`) — check a real delivery or `POST
   /account/webhook/test`.
3. **Order status vocabulary** (processing/completed/failed/refunded?) — the
   docs never enumerate it.
4. **Refund behavior** when fulfillment fails after balance debit.
5. **Plan tier** — which subscription tier do we need for the products we
   want (403 = product not enabled for plan)? Trial availability?
6. Whether the checkout already supports per-product buyer fields (needed for
   top-ups' `player_id`) or that's new work.

## 7. Env vars to provision (all environments, incl. staging)

```
FAZERCARDS_API_KEY=            # reseller hub → Profile
FAZERCARDS_WEBHOOK_SECRET=     # hub → Settings → Webhook (or GET /account/webhook)
```

Remember the staging/prod env split on Vercel (sensitive vars, per-environment
scoping) and that env changes need a redeploy.
