# Analytics events (GA4)

Every event Ghost.ma sends to Google Analytics 4, and exactly what triggers it.
If an event is not in this table, we do not send it.

## How it is wired

- **Provider**: GA4 only, via raw `gtag.js` injected in `src/app/layout.tsx`.
  No GTM, no Meta Pixel, no other tracker.
- **Gate**: `isProductionRuntime() && Boolean(gaId)`. Staging and preview
  deployments send nothing. `NEXT_PUBLIC_GA_ID` has **no fallback value** — unset
  it and analytics is completely off.
- **Client events** go through `trackEvent` / `trackEcommerce` in
  `src/lib/analytics.ts`. Both no-op when `gtag` is absent (dev, ad blockers,
  SSR), so callers never guard.
- **Server events** go through the GA4 Measurement Protocol in
  `src/lib/analytics/purchase.ts`. They no-op unless `GA_API_SECRET` **and**
  `NEXT_PUBLIC_GA_ID` are set **and** the runtime is production.
- **Currency is always `MAD`.** `value` is always the amount in MAD, rounded to
  2 decimals.

## PII rules (non-negotiable)

Events carry **product and money data only**. Never sent, under any key:

- e-mail addresses, names, phone numbers, postal addresses
- customer-facing order numbers, order access tokens
- delivered gift-card / activation codes
- passwords, session cookies, payment-proof uploads
- supplier credentials or any API key

The one free-text value we send is `search_term`, GA4's standard field, matching
common ecommerce practice.

## Event table

| Event | Where | Trigger | Key params |
|---|---|---|---|
| `search` | header search | a search query is submitted | `search_term` |
| `view_item_list` | catalog | a product list renders | `items`, `item_list_name` |
| `view_item` | product page | a product page renders | `items`, `value` |
| `select_item` | catalog | a product card is clicked | `items`, `item_list_name` |
| `add_to_cart` | product page | "Ajouter au panier" succeeds | `items`, `value` |
| `view_cart` | `/cart` | cart page mounts with a non-empty cart, **once per visit** (not on quantity edits) | `items`, `value` = cart total |
| `remove_from_cart` | `/cart` | "Retirer" is clicked, fired **before** removal so the item is still known | `items`, `value` = line total |
| `begin_checkout` | `/checkout` | checkout page mounts with a non-empty cart, **once per visit** | `items`, `value` = cart total |
| `add_payment_info` | `/checkout` | `createOrderAction` returns successfully and the customer is routed to the payment page | `items`, `value` = total to pay, `payment_type` |
| `login` | server action | `loginCustomerAction` succeeds | `method: "password"` |
| `sign_up` | server action | `registerCustomerAction` succeeds | `method: "password"` |
| `purchase` | **server**, Measurement Protocol | the order transitions to confirmed/delivered | `transaction_id`, `items`, `value` |
| `promo_code_*` | `/checkout` | promo code attempted / accepted / rejected / removed | `reward_type`, `reason` |

`view_item`, `view_item_list`, `select_item` and `add_to_cart` live in the
product/catalog components and use the same `toAnalyticsItem` helper — GA4 only
joins funnel steps when the item shape is identical, which is why every event
builds items through that one function.

### Notes on two events

**`add_payment_info`** — Ghost.ma does not pick a bank/wallet at checkout; that
happens later on the payment page. `payment_type` therefore reports what was
*offered* (the single method's type, or `"multiple"`), not a per-customer
choice. It is an honest approximation, not a per-customer payment selection.

**`login` / `sign_up`** — these happen inside server actions where there is no
`gtag` to call, so they go out over the Measurement Protocol, attributed to the
visitor's own `_ga` cookie when it is present. They are fire-and-forget: auth
never waits on analytics.

## The `purchase` event

`purchase` is deliberately **not** fired in the browser. The payment page polls
order status every 5 seconds; a client-side purchase event would re-fire on
every poll and on every refresh, inflating revenue without limit.

Instead it is sent server-side, once, at the state transition, with the
**internal order id as `transaction_id`**. GA4 de-duplicates on that key, so a
retry, a webhook replay or a manual re-confirmation can never create a second
purchase.

Guarantees, all covered by `test/ops/analyticsPurchase.test.ts`:

- silent no-op when `GA_API_SECRET` is unset (the current state)
- silent no-op outside the production runtime, so staging never pollutes the
  live property
- never throws; a GA outage cannot block or delay order fulfilment
- the payload contains no PII

### Call site

`src/lib/analytics/purchase.ts` is standalone. To activate the event, add this
single line at the point the order becomes confirmed/delivered — in
`src/lib/db/payments.ts` or `src/lib/db/fulfillment.ts`, **after** the status
write has committed:

```ts
void sendPurchaseEvent({
  orderId: order.id,
  totalMad: order.totalMad,
  items: order.items.map((i) => ({
    item_id: i.productId,
    item_name: i.productName,
    price: i.unitPriceMad,
    quantity: i.quantity,
  })),
});
```

with

```ts
import { sendPurchaseEvent } from "@/lib/analytics/purchase";
```

`void` is load-bearing: it documents that the promise is intentionally not
awaited. Do not `await` it in a fulfilment path.

Adjust the field names to whatever that module's order object actually calls
them — `totalMad` must be the **server-recomputed** total, not a client value.

## Setup checklist

1. Set `NEXT_PUBLIC_GA_ID` on the production environment only.
2. In GA4: Admin → Data Streams → your stream → Measurement Protocol API
   secrets → create one. Put it in `GA_API_SECRET` (production only, secret,
   never `NEXT_PUBLIC_`).
3. Add the one-line call site above.
4. Verify in GA4 DebugView, then check that Realtime shows exactly one
   `purchase` per order.
