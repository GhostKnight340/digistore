# Meta Tracking Integration

Ghost Digital sends e-commerce events to Meta on two channels:

- **Meta Pixel** (browser) — loaded lazily by `src/lib/meta/client.ts`; boots on
  the first tracked event when `NEXT_PUBLIC_META_PIXEL_ID` is set.
- **Conversions API** (server) — `src/lib/meta/capi.ts`, using
  `META_CONVERSIONS_API_ACCESS_TOKEN`.

Every event carries an `event_id` shared by both channels so Meta deduplicates
the pair. All monetary values are in `MAD`. Content ids are the storefront
product ids (product slug, or variant id for variant purchases) — the same ids
used in the cart and order flow.

## Configuration

| Variable | Side | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_META_PIXEL_ID` | both | Pixel / dataset id. Unset ⇒ whole integration disabled. |
| `META_CONVERSIONS_API_ACCESS_TOKEN` | server | CAPI token. Unset ⇒ server events disabled (pixel still runs). |
| `META_TEST_EVENT_CODE` | server | Optional. Routes CAPI events to Events Manager "Test events". |
| `META_GRAPH_API_VERSION` | server | Optional. Defaults to `v21.0`. |

Set these in Vercel → Project → Settings → Environment Variables. No code
changes or redeploy logic needed beyond the redeploy Vercel does on env change.

## Event map

| Event | Where it fires | event_id | Channels |
| --- | --- | --- | --- |
| `PageView` | every route change (`MetaPixel` in the root layout) | random UUID | pixel + CAPI relay |
| `ViewContent` | product detail page | random UUID | pixel + CAPI relay |
| `Search` | `/products?q=…` | random UUID | pixel + CAPI relay |
| `ViewCategory` (custom) | `/products?category=…` | random UUID | pixel + CAPI relay |
| `AddToCart` | add-to-cart / buy-now buttons | random UUID | pixel + CAPI relay |
| `InitiateCheckout` | checkout page load with a non-empty cart | random UUID | pixel + CAPI relay |
| `Purchase` | order creation (`createOrder`) | `purchase.<orderId>` | CAPI from the server action; pixel half fired by the checkout client with the same id |
| `CompleteRegistration` | account registration (form + new Google accounts) | `registration.<customerId>` | CAPI from the server; pixel half fired by the login page (form flow only) |

Purchase fires when the order is created (`pending_payment`), matching how this
store sells: payment is manual (bank / crypto / PayPal) and confirmed later by
an admin. `order_id` is the public order number; `contents` carries per-item
id, quantity, and unit price.

## Deduplication design

- **Browser-originated events** (`PageView` … `InitiateCheckout`): the client
  generates a UUID, fires `fbq(..., { eventID })`, and POSTs the same payload
  to `/api/meta/track`, which enriches it with the caller's IP, user agent,
  `_fbp`/`_fbc` cookies, and the logged-in customer's email/id, then forwards
  it to CAPI.
- **Server-authoritative events** (`Purchase`, `CompleteRegistration`): the
  server action sends CAPI directly with a deterministic event id and full
  customer data (hashed email/phone/name); the client fires only the pixel
  half via `trackMetaPixelOnly` with the same id. `/api/meta/track` rejects
  these event names so a stray client call can't double-report revenue.

All customer identifiers sent to CAPI (email, phone, first/last name,
external id) are SHA-256 hashed per Meta's requirements. Phone numbers are
normalized to digits with a country code (leading `0` on 10-digit numbers is
rewritten to `212`).

## Failure behaviour

Tracking never breaks the user flow: CAPI failures are logged
(`[meta:capi]`, `[meta:purchase]`, `[meta:registration]`) and swallowed, and
the browser relay is fire-and-forget with `keepalive`.

## Verifying

1. Set the env vars locally plus `META_TEST_EVENT_CODE` from Events Manager →
   Test events.
2. Browse a product, search, add to cart, check out, and register.
3. In Test events you should see each event once, with matching
   browser/server pairs marked as deduplicated.
