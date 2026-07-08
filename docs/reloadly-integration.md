# Reloadly Integration

Status: **live as an optional per-variant fulfillment source.** An admin can
set a `ProductVariant.stockControl` to `"reloadly"` (alongside the existing
`"manual"`/`"api"` values) and map it to a Reloadly gift-card product +
country. Local `DigitalCode` inventory and manual code entry remain fully
functional and unaffected — Reloadly is a third parallel branch inside
`deliverOrder()`, not a replacement. Verified end-to-end 2026-07-08 with a
real sandbox purchase through the actual checkout → admin-approval →
delivery flow (see "Verification" below).

## Env vars

| Var | Required | Notes |
| --- | --- | --- |
| `RELOADLY_CLIENT_ID` | Yes, to enable Reloadly calls | From the Reloadly dashboard, Developers > API settings. |
| `RELOADLY_CLIENT_SECRET` | Yes, to enable Reloadly calls | Same page as above. Treat like a password — never log it. |
| `RELOADLY_ENV` | No | `sandbox` (default) or `live`. Anything other than exactly `live` is treated as sandbox, so a typo can't accidentally hit production. |

Sandbox and live are **separate credential pairs** in Reloadly's dashboard
(toggle Sandbox/Live, then Developers > API settings shows the matching
client id/secret for that mode). A sandbox client id will not authenticate
with `RELOADLY_ENV=live` and vice versa.

Without `RELOADLY_CLIENT_ID`/`RELOADLY_CLIENT_SECRET` set, every function in
`src/lib/reloadly/operations.ts` throws `ReloadlyConfigError` immediately —
`deliverOrder()`'s Reloadly pre-pass propagates that as a clean, zero-DB-write
failure rather than silently falling back.

## Module layout

- `src/lib/reloadly/config.ts` — reads env vars, resolves sandbox vs live base URLs. Only module allowed to read `process.env.RELOADLY_*`.
- `src/lib/reloadly/client.ts` — OAuth2 client-credentials token fetch + in-memory cache (refreshed ~60s before expiry), authenticated `fetch` wrapper. Only module allowed to build the `Authorization` header. Never logs the client secret or an access token.
- `src/lib/reloadly/operations.ts` — domain functions: `getGiftCardProducts()`, `getGiftCardProduct(productId)`, `placeGiftCardOrder(input)`, `getGiftCardOrderStatus(transactionId)`, `getGiftCardOrderCards(transactionId)`.

Note: Reloadly issues a separate token per product API (the OAuth "audience").
The token cache in `client.ts` is keyed by base URL/audience for this reason
— a gift-cards token will not authenticate against the airtime or utilities
APIs if those are added later.

### Verified API quirks (not obvious from Reloadly's docs)

- The Gift Cards API 406s on a plain `Accept: application/json` header — it
  requires `Accept: application/com.reloadly.giftcards-v1+json`
  (`client.ts` sends this by default).
- `GET /products` returns a Spring-style page object keyed by
  `totalElements`/`number`, not `totalContent`/`page`.
- `POST /orders` returns the full transaction synchronously, including
  `status: "SUCCESSFUL"` for a normal order — usually no polling needed.
- The order response does **not** include the redeem code. Fetch it
  separately via `GET /orders/transactions/{id}/cards`, which returns
  `[{ cardNumber, pinCode }]`. Status lookups use `GET
  /reports/transactions/{id}` — not `/orders/transactions/{id}`, which 404s.

## Schema

`ProductVariant` gained two nullable columns, only meaningful when
`stockControl === "reloadly"`:
- `reloadlyProductId Int?` — the Reloadly gift-card product id.
- `reloadlyCountryCode String?` — the 2-letter country code for that product.

`DeliveredCode` gained three columns for audit/traceability (the actual
redeem code text still lives in the existing `manualCode` column, so
customer-facing code display needed zero changes):
- `source String @default("local")` — `"local"` (existing digitalCodeId/manualCode entries, unchanged) or `"reloadly"`.
- `reloadlyTransactionId Int?`
- `reloadlyOrderId Int?` (currently always null — Reloadly's response doesn't expose a separate order id beyond `transactionId`; kept for forward compatibility)

Migration: `prisma/migrations/20260707120000_add_reloadly_fulfillment/`.

## How fulfillment picks a source

In `src/lib/db/fulfillment.ts`, `deliverOrder()`:
1. Validates every order item has enough filled code "slots" — a slot counts as filled if it has `digitalCodeId`, `manualCode`, or (new) `reloadlyProductId`.
2. **Before opening any DB transaction**, resolves every `reloadlyProductId` slot by calling Reloadly (`placeGiftCardOrder` → `getGiftCardOrderCards`), sequentially. Any failure aborts immediately with zero DB writes — external HTTP calls never happen inside an open Postgres transaction.
3. Runs the existing transaction unchanged for local/manual slots; the new `reloadlyProductId` branch just writes the pre-resolved code as `DeliveredCode.manualCode` with `source: "reloadly"`.

Known limitation (documented in code): no persisted idempotency ledger. Safe
for the common case of one Reloadly-sourced item per delivery action
(all-or-nothing). If a single delivery spans multiple Reloadly items and a
later one fails, retrying re-purchases the earlier ones too.

## Admin UI

- **Products → variant editor**: set "Gestion du stock" to `reloadly`, then fill in "Reloadly - Product ID" and "Reloadly - Code pays". Use the `faceValue`/`faceCurrency` fields for the exact denomination — it's sent as Reloadly's `unitPrice`.
- **Order detail → delivery panel**: when an item's variant is Reloadly-sourced, each code slot shows a "⚡ Via Reloadly" toggle button alongside the normal local/manual controls. Selecting it marks that slot for live Reloadly fulfillment at delivery time.

## Reverting to manual-only

No code changes needed. Either:
- Don't set any variant's `stockControl` to `"reloadly"` (default stays `"manual"`), or
- Unset `RELOADLY_CLIENT_ID`/`RELOADLY_CLIENT_SECRET` — any Reloadly resolution attempt then fails closed before touching the database.

The local-inventory and manual-code branches of `deliverOrder()` are
unmodified parallel `if` branches; nothing about them depends on Reloadly
existing.

## Verification

Confirmed live end-to-end on 2026-07-08 using a Neon database branch (never
against production):
1. Created a test product/variant (`netflix-us-test-reloadly`, `stockControl: "reloadly"`, `reloadlyProductId: 18681`, `reloadlyCountryCode: "US"`, `faceValue: 20 USD`).
2. Real customer checkout → payment proof submission (order #000007, 210 MAD).
3. Admin "Confirmer le paiement" (existing, untouched flow).
4. Admin toggled "⚡ Via Reloadly" on the code slot, clicked "Livrer la commande".
5. Result: `deliverOrder()` returned success; `DeliveredCode` row had `source: "reloadly"`, `reloadlyTransactionId: 72424`, `manualCode: "MKujttest / 54205test"`; `Order.status === "delivered"`.
6. Customer-facing `/payment/000007` page (the delivery view) correctly displayed the real sandbox code behind the existing reveal-to-view UI.
7. Reloadly sandbox wallet balance decreased accordingly, confirming a real (sandbox) purchase, not a mock.
8. Regression check: ran an ordinary Steam Wallet order (local product, no Reloadly involvement) through the identical checkout → confirm → manual-code-entry → deliver flow. Result: `DeliveredCode.source` correctly defaulted to `"local"`, `reloadlyTransactionId`/`reloadlyOrderId` null — zero behavioral change to the pre-existing path.

To re-run this test: `npm run dev`, log in as an admin, create/reuse a
Reloadly-sourced variant with real sandbox `reloadlyProductId`/
`reloadlyCountryCode`, and repeat steps 2–6 above.
