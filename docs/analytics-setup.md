# Analytics setup

How analytics is wired, what it may and may not send, and how to verify it.
Companion to `docs/analytics-events.md`, which is the event catalogue.

> **State as of 2026-07-19.** GA4 is implemented and consent-gated. **Meta Pixel
> is not implemented** — the consent layer and the env contract below are shaped
> to accept it, but no pixel code ships today. Do not set
> `NEXT_PUBLIC_META_PIXEL_ID` expecting it to work.

---

## 1. Environment variables

| Variable | Scope | Secrecy | Meaning |
|---|---|---|---|
| `NEXT_PUBLIC_GA_ID` | production | PUBLIC | GA4 measurement id (`G-…`). **No fallback** — unset means analytics is fully off. |
| `GA_API_SECRET` | production | **SECRET** | Measurement Protocol secret for the server-side `purchase` event. Never `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | all | PUBLIC | Kill switch. Set to `false` to disable every provider without unsetting ids. **Absent = enabled**, so existing deployments are unaffected. |
| `NEXT_PUBLIC_ANALYTICS_DEBUG` | dev/staging | PUBLIC | `true` logs every event to the console **instead of** sending it. Ignored in production. |

`NEXT_PUBLIC_META_PIXEL_ID` is **reserved, not implemented**.

### The gate

An analytics provider loads only when **all** of these hold
(`src/lib/analytics/consent.ts`, `mayLoadProvider`):

1. `NEXT_PUBLIC_ANALYTICS_ENABLED !== "false"`
2. the provider id is set
3. `isProductionRuntime()` — staging and preview never send
4. the visitor's stored consent is `granted`

Undecided and refused are treated identically. There is no consent-by-scrolling
and no pre-ticked option.

---

## 2. GA4 setup

1. Create a GA4 property → **Admin → Data streams → Web**. Copy the measurement
   id (`G-…`) into `NEXT_PUBLIC_GA_ID` in the Vercel **Production** environment.
2. **Admin → Data streams → your stream → Measurement Protocol API secrets →
   Create.** Copy into `GA_API_SECRET` (server-only, do **not** prefix).
3. Mark `purchase` as a conversion under **Admin → Events**.
4. Currency is always `MAD`. Set the property currency to match or revenue
   reports will misconvert.

> ⚠️ **Staging shares Vercel environment variables with production** (see
> `docs/pre-launch-audit.md`, C-ENV-1). `isProductionRuntime()` is what stops
> staging polluting the live property — it is a code guard, not an env guard.
> Do not remove it.

## 3. Meta Pixel setup

Not implemented. When it is added, it must go through `mayLoadProvider` like GA4
and `CONSENT_VERSION` must be incremented so previously-stored consent is
re-requested — visitors consented to a different set of providers.

---

## 4. Event mapping

The catalogue lives in `docs/analytics-events.md`. Ownership summary:

| Event | Side | Fires when |
|---|---|---|
| `page_view` | browser | implicit, via `gtag('config')` |
| `view_item_list`, `select_item`, `search` | browser | catalogue interaction |
| `view_cart`, `remove_from_cart` | browser | `/cart` |
| `begin_checkout` | browser | `/checkout` mounts with a non-empty cart, once per mount |
| `add_payment_info` | browser | order created, customer routed to payment |
| `checkout_error` | browser | order creation fails — **reason code only** |
| `purchase` | **server** | the order reaches `delivered` |
| `login`, `sign_up` | **server** | the corresponding action succeeds |

**Still not implemented** (tracked in `docs/launch-readiness-audit.md`):
`view_item`, `add_to_cart`, `payment_proof_submitted`, `payment_method_changed`,
`support_contact_clicked`.

### `checkout_error` carries a code, never a message

Server errors are French prose that can embed a product name. Checkout maps them
to a closed vocabulary (`src/lib/checkout/errorReporting.ts`):

`empty_cart · item_unavailable · payment_method_unavailable · invalid_quantity ·
invalid_phone · account_exists · email_unverified · rate_limited ·
promo_rejected · other`

---

## 5. How purchase deduplication works

`purchase` is sent **server-side** from `deliverOrder`
(`src/lib/db/fulfillment.ts`), not from the browser. Four layers stop
double-counting, the first of which is the authoritative one:

1. **A durable database marker.** `Order.analyticsPurchaseSentAt` is claimed with
   a conditional update:

   ```ts
   const claimed = await prisma.order.updateMany({
     where: { id: orderId, analyticsPurchaseSentAt: null },
     data:  { analyticsPurchaseSentAt: new Date() },
   });
   if (claimed.count === 1) { /* send */ }
   ```

   Exactly one caller can ever flip it from `NULL`, so exactly one send happens —
   enforced by the database, across processes, permanently. Verified against the
   dev branch: of two concurrent claims exactly one returns `count: 1`, and a
   subsequent re-delivery returns `0`.

   The marker is claimed **before** sending, not after. A crash mid-send
   therefore loses one event rather than risking a duplicate: for revenue
   reporting, under-counting is the safer failure.

2. **It is not a page event.** The payment page polls every 5s and can be
   refreshed; a browser-side `purchase` would re-fire on every poll.
3. **The transition is atomic.** The send sits after an `updateMany` guarded on
   `status: "payment_confirmed"` which throws unless exactly one row changed.
4. **GA4 collapses on `transaction_id`**, which is the internal order id.

Layers 2–4 were the *entire* mechanism before the marker existed. They held, but
none of them is a guarantee this codebase owns — a manual re-delivery, a change
to the fulfilment path, or a GA4 configuration change could have silently
double-counted revenue. Layer 1 makes exactly-once our invariant.

**Re-sending deliberately** (e.g. after fixing a bad measurement id) means
clearing the marker for the affected orders. There is no UI for this; it is a
deliberate manual database operation.

**`purchase` fires on `delivered`, not on payment confirmation.** An order that
is confirmed but never delivered sends nothing. Proof submission is never a
purchase.

---

## 6. Testing locally

```bash
# .env.local
NEXT_PUBLIC_GA_ID=G-XXXXXXX          # any value; nothing is sent in dev
NEXT_PUBLIC_ANALYTICS_DEBUG=true
npm run dev
```

Every `trackEvent` call prints `[analytics] <name> { …params }` to the console
**instead of** sending — `mayLoadProvider` returns false outside production, so
`window.gtag` is never even defined. This is the intended way to inspect payloads
and to confirm no PII is present.

The consent banner appears whenever `NEXT_PUBLIC_GA_ID` is set, including in dev,
so the flow itself is testable. Reset with:

```js
localStorage.removeItem('ghost.analytics-consent')
```

## 7. Verifying in GA4 DebugView

DebugView needs real traffic, so this only works against production. Use the
**Google Analytics Debugger** Chrome extension on the live site, accept the
consent banner, then open **Admin → DebugView**. Events appear within seconds.
Server-side `purchase` events reach DebugView only if `debug_mode` is added to
the Measurement Protocol payload — it is not, deliberately.

## 8. Verifying in Meta Events Manager

Not applicable — no pixel ships. When one does: Events Manager → Test Events,
with the Meta Pixel Helper extension.

## 9. Browser vs server

| | Browser | Server |
|---|---|---|
| Transport | `gtag.js` | Measurement Protocol (`fetch`) |
| Gated on consent | **yes** — script is not loaded without it | **no** (see below) |
| Module | `src/lib/analytics.ts` | `src/lib/analytics/purchase.ts` |
| Client id | real, from the `_ga` cookie | `_ga` when a request exists, else a synthetic id derived from the order id |

**Why the server event is not consent-gated:** it carries no cookie-derived
identifier when the visitor refused (there is no `_ga` cookie to read), so it
falls back to a synthetic per-order id. It is order-level commercial reporting
rather than behavioural tracking of an identified visitor. If your legal advice
requires gating it too, the hook is `sendPurchaseEvent` in `fulfillment.ts` —
but note the order total is business data the shop is entitled to record.

---

## 10. Privacy: what is excluded

Never sent, under any key, browser or server:

- names, e-mail addresses, phone numbers, postal addresses
- customer-facing **order numbers** and order access tokens
- delivered gift-card / activation codes
- payment proofs, bank details, crypto wallet addresses
- passwords, session cookies, API keys, supplier credentials
- admin data, and raw server error messages

Sent: product ids/names/categories, quantities, prices and order totals in MAD,
the `search_term` (GA4's standard field), and `checkout_error` reason codes.

The internal order id **is** used as `transaction_id`. It is an opaque cuid, not
a customer-facing reference, and it is the dedup key — but note it is the one
internal identifier that leaves the system.

### The measurable-conversion tradeoff

Consent-gating **will reduce measured conversions**. Visitors who refuse or
ignore the banner are invisible to GA4: their sessions, funnel steps and browser
events are never recorded.

Concretely: GA4 will under-report traffic and browser-side funnel volume by
whatever share of visitors declines. Typical decline rates run **20–40%**, so
plan for GA4 showing meaningfully fewer sessions than reality.

**What stays accurate:** the server-side `purchase` event fires regardless of
consent, so *revenue and order counts remain complete*. What becomes unreliable
is the **ratio** between them — conversion rate computed as
`purchases / sessions` will be inflated, because the numerator is complete and
the denominator is not. Use the database, not GA4, for anything financial.
