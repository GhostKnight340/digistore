# Reloadly Integration

Status: **live, sandbox-only, with automatic fulfillment.** An admin maps a
`ProductVariant` to a Reloadly gift-card product (`stockControl: "reloadly"` +
`reloadlyProductId` + `reloadlyCountryCode`), and can flip
`reloadlyAutomationEnabled` on. When that's on, any order containing that
variant is purchased from Reloadly and delivered automatically the moment
its payment is confirmed — no admin click required. When it's off, the
variant stays mapped for the admin's manual "Via Reloadly" delivery toggle,
exactly as before. Local `DigitalCode` inventory and free-text manual code
entry remain fully functional, unaffected, and are still the default for any
variant that isn't mapped to Reloadly at all.

## Env vars

| Var | Required | Notes |
| --- | --- | --- |
| `RELOADLY_CLIENT_ID` | Yes, to enable Reloadly calls | From the Reloadly dashboard, Developers > API settings. |
| `RELOADLY_CLIENT_SECRET` | Yes, to enable Reloadly calls | Same page as above. Treat like a password — never log it, never send it to the client. |
| `RELOADLY_ENV` | No | `sandbox` (default) or `live`. Anything other than exactly `live` is treated as sandbox, so a typo can't accidentally hit production. |

Sandbox and live are **separate credential pairs** in Reloadly's dashboard
(toggle Sandbox/Live, then Developers > API settings shows the matching
client id/secret for that mode). A sandbox client id will not authenticate
with `RELOADLY_ENV=live` and vice versa. **Only sandbox is enabled for this
store today** — nothing here has been verified against live credentials, and
`RELOADLY_ENV` should stay unset or `sandbox` in every deployed environment
until a deliberate decision is made to go live. The admin order/delivery UI
labels every Reloadly-mapped item "Reloadly Sandbox" as a reminder.

Without `RELOADLY_CLIENT_ID`/`RELOADLY_CLIENT_SECRET` set, every function in
`src/lib/reloadly/operations.ts` throws `ReloadlyConfigError` immediately.
The automatic-fulfillment pass catches this per item, records it as a
`fulfillmentStatus: "failed"` with that message, and leaves the order at
`payment_confirmed` for manual handling — it never blocks payment
confirmation itself.

## Module layout

- `src/lib/reloadly/config.ts` — reads env vars, resolves sandbox vs live base URLs. Only module allowed to read `process.env.RELOADLY_*`.
- `src/lib/reloadly/client.ts` — OAuth2 client-credentials token fetch + in-memory cache (refreshed ~60s before expiry), authenticated `fetch` wrapper. Only module allowed to build the `Authorization` header. Never logs the client secret or an access token.
- `src/lib/reloadly/operations.ts` — domain functions: `getGiftCardProducts()`, `getGiftCardProduct(productId)`, `searchGiftCardProductsForAdmin()` (admin catalog picker, see below), `placeGiftCardOrder(input)`, `getGiftCardOrderStatus(transactionId)`, `getGiftCardOrderCards(transactionId)`.
- `src/lib/db/fulfillment.ts` — where Reloadly meets the order/payment/delivery flow: manual "Via Reloadly" delivery (`deliverOrder`), automatic fulfillment (`attemptAutomaticReloadlyFulfillment`), and admin retry (`retryReloadlyFulfillment`).
- `src/app/actions/reloadly.ts` — server actions: `searchReloadlyProductsAction`, `getReloadlyStatusAction`, `retryReloadlyFulfillmentAction`.

Note: Reloadly issues a separate token per product API (the OAuth "audience").
The token cache in `client.ts` is keyed by base URL/audience for this reason
— a gift-cards token will not authenticate against the airtime or utilities
APIs if those are added later.

### Verified API quirks (not obvious from Reloadly's docs)

- The Gift Cards API 406s on a plain `Accept: application/json` header — it
  requires `Accept: application/com.reloadly.giftcards-v1+json`
  (`client.ts` sends this by default).
- `GET /products` returns a Spring-style page object keyed by
  `totalElements`/`number`, not `totalContent`/`page`. There is no free-text
  search parameter, so the admin catalog picker (`searchGiftCardProductsForAdmin`)
  filters the returned page client-side by product/brand name.
- `POST /orders` returns the full transaction synchronously, including
  `status: "SUCCESSFUL"` for a normal order — usually no polling needed.
- The order response does **not** include the redeem code. Fetch it
  separately via `GET /orders/transactions/{id}/cards`, which returns
  `[{ cardNumber, pinCode }]`. Status lookups use `GET
  /reports/transactions/{id}` — not `/orders/transactions/{id}`, which 404s.

## Schema

`ProductVariant` — only meaningful when `stockControl === "reloadly"`:
- `reloadlyProductId Int?` — the Reloadly gift-card product id.
- `reloadlyCountryCode String?` — the 2-letter country code for that product.
- `reloadlyAutomationEnabled Boolean @default(false)` — gates *automatic*
  purchase at payment confirmation. The manual "Via Reloadly" delivery
  toggle works regardless of this flag as long as the product/country id are
  set; this flag only controls whether it happens without an admin click.

`OrderItem` gained fulfillment-tracking columns (independent of `Order.status`,
which stays the one customer-facing lifecycle field — a partially-automated
order, some items Reloadly-fulfilled and others still manual, is represented
here without inventing a new order status):
- `fulfillmentStatus String @default("pending")` — `"pending" | "fulfilled" | "failed"`.
- `fulfillmentSource String?` — `"reloadly" | "manual"`.
- `fulfillmentError String?` — last error message, if failed.
- `reloadlyTransactionId Int?` / `reloadlyOrderId Int?` — last Reloadly transaction for this item.
- `fulfillmentAttempts Int @default(0)`, `lastFulfillmentAttemptAt DateTime?`.

`DeliveredCode` (unchanged from before, still the source of truth for actual
codes and the idempotency ledger — see below):
- `source String @default("local")` — `"local"` (existing digitalCodeId/manualCode entries) or `"reloadly"`.
- `reloadlyTransactionId Int?`, `reloadlyOrderId Int?`.

Migrations: `prisma/migrations/20260707120000_add_reloadly_fulfillment/`,
`prisma/migrations/20260708130000_add_reloadly_automation/`.

## Automatic fulfillment flow

Fired from `src/lib/db/payments.ts` right after any payment-confirmation
transition reaches `payment_confirmed` — both the PayPal webhook/capture
path (`transitionPaypalStatus`) and the admin manual-approval path
(`setPaymentStatus`) call `void attemptAutomaticReloadlyFulfillment(orderId)`
immediately after their existing `notifyFulfillmentNeeded` Discord ping.
It's called fire-and-forget with its own `.catch()`, and the function itself
never throws — a Reloadly outage or misconfiguration can never fail payment
confirmation.

`attemptAutomaticReloadlyFulfillment(orderId)`:
1. Loads the order and its items/variants.
2. For every item whose variant has `stockControl === "reloadly"` **and**
   `reloadlyAutomationEnabled === true`, calls `fulfillOrderItemViaReloadly`.
3. That function purchases the item's *remaining* units one at a time
   (`quantity` minus however many `DeliveredCode` rows already exist for
   that item — see Idempotency below), persisting each success immediately
   so a later unit failing never loses an earlier one.
4. On full success for an item: `OrderItem.fulfillmentStatus = "fulfilled"`,
   the code(s) are already in `DeliveredCode`, Discord gets a
   "auto-fulfilled" ping.
5. On failure: `OrderItem.fulfillmentStatus = "failed"` with the error
   message, attempt count, and timestamp recorded; Discord gets a
   `notifyFulfillmentFailed` ping with the error and an admin link. The
   order is never lost — it just stays at `payment_confirmed`.
6. After processing every eligible item, `finalizeAutoDeliveryIfComplete`
   checks whether *every* item in the order (not just the Reloadly ones) now
   has enough `DeliveredCode` rows to cover its quantity. If so, the order
   transitions to `delivered`, the existing `order_delivered` email is sent
   (with every delivered code, not just this batch's), and
   `notifyFulfillmentCompleted` fires — the same customer-facing outcome as
   a manual delivery.

If an order mixes a Reloadly-automated item with a manual/local item, the
Reloadly item is delivered automatically while the order stays at
`payment_confirmed`; the admin's normal delivery UI only asks for the
remaining (manual) item — the Reloadly-covered slot shows as an already-
delivered, read-only code row instead of an input.

## Idempotency

Every purchase attempt — automatic, manual "Via Reloadly", or admin retry —
first counts existing `DeliveredCode` rows for that `orderItemId`
(`countDeliveredByItem`). Only `quantity - alreadyDelivered` units are ever
purchased. This makes the following all safe to re-run without double
spend:
- A retried/duplicated payment-confirmation call (webhook replay, race
  between webhook and browser capture, admin double-click).
- The admin retry button on a failed item (`retryReloadlyFulfillment`) —
  only picks up where the last attempt left off.
- Refreshing/reloading the admin order detail page mid-delivery.

Each `DeliveredCode` row records `reloadlyTransactionId`/`reloadlyOrderId`
for audit; `OrderItem` also carries the *last* transaction id for quick
display without joining `DeliveredCode`.

## Admin UI

- **Products → variant editor**: set "Gestion du stock" to `reloadly`, fill
  in Product ID + country code (or use the "🔍 Parcourir le catalogue
  Reloadly (Sandbox)" picker — searches Reloadly's sandbox catalog by name/
  country and fills product id, country, currency, and face value for you),
  then flip "Fulfillment automatique" on to enable automatic purchase at
  payment confirmation. Leaving it off keeps the variant on manual "Via
  Reloadly" delivery only.
- **Order detail → delivery panel**: a "Reloadly Sandbox" badge appears
  whenever any item is Reloadly-mapped. Already-delivered units (including
  ones fulfilled automatically) show as read-only code rows. A failed
  automatic attempt shows an inline error banner with a "🔁 Réessayer via
  Reloadly" retry button. Items still needing a code show the existing
  local/manual inputs, plus the manual "⚡ Via Reloadly" toggle for
  Reloadly-mapped items regardless of the automation flag.

## Reverting to manual-only

No code changes needed. Either:
- Don't set any variant's `stockControl` to `"reloadly"` (default stays `"manual"`), or
- Leave `reloadlyAutomationEnabled` off (default) to keep a mapped variant on manual delivery only, or
- Unset `RELOADLY_CLIENT_ID`/`RELOADLY_CLIENT_SECRET` — any Reloadly resolution attempt then fails closed with zero DB writes beyond the item's own failure record.

The local-inventory and manual-code branches of `deliverOrder()` are
unmodified parallel `if` branches; nothing about them depends on Reloadly
existing.

## Verification

Confirmed live end-to-end (manual "Via Reloadly" path) on 2026-07-08 using a
Neon database branch (never against production): real sandbox purchase
through checkout → admin-approval → delivery → customer delivery page, and
a regression check that an ordinary local-stock order is unaffected. See git
history for the full write-up.

To verify the **automatic** path: create/reuse a Reloadly-sourced variant
with a real sandbox `reloadlyProductId`/`reloadlyCountryCode`, flip
"Fulfillment automatique" on, place an order, and confirm payment (either
via the admin "Confirmer le paiement" button or a PayPal sandbox capture).
Expect: within a few seconds the order flips straight to `delivered` with no
further admin action, the `order_delivered` email is sent, and
`/delivery/<order>` shows the real sandbox code. To see the failure path,
temporarily unset `RELOADLY_CLIENT_ID` and confirm payment again — the item
should show `fulfillmentStatus: "failed"` with a clear error in the admin
order detail page, and the order should remain at `payment_confirmed`
rather than erroring out.
