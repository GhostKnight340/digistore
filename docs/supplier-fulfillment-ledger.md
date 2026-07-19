# Supplier fulfillment ledger

Status: **foundation implemented and unit-tested; not yet wired into the live
delivery path.** See “What is not done” at the end before relying on this.

The ledger is the provider-agnostic machinery that makes supplier purchasing
safe: at most one purchase per deliverable unit, at most one delivery to the
customer, and an explicit, recoverable state for “we do not know whether we were
charged”. It was introduced for FazerCards but nothing in it is
FazerCards-specific — Reloadly can adopt it unchanged.

## Why it exists

Before it, `deliverOrder` resolved supplier purchases with no persisted record
of an attempt. That left two holes:

1. A crash between “request sent” and “response stored” lost all evidence that
   money may have moved.
2. Multi-code supplier deliveries were **refused outright**
   ([fulfillment.ts:196](../src/lib/db/fulfillment.ts)) because a partial failure
   across several purchases would re-buy the earlier ones on retry.

The ledger closes both by writing a row *before* the request leaves.

## Data model

`SupplierFulfillment` — one row per **slot**, a slot being one deliverable unit,
keyed `(orderItemId, slotIndex)`. Quantity 3 ⇒ slots 0, 1, 2.

Two unique indexes carry the safety guarantees:

| Index | Guarantees |
|---|---|
| `(orderItemId, slotIndex)` | Two concurrent fulfillment runs race on the insert; exactly one wins and dispatches. |
| `idempotencyKey` | The provider-facing key can never be reused across slots. |

Plus `DeliveredCode.supplierFulfillmentId UNIQUE` — the last line of defence
against double delivery.

## State machine

```
pending ──▶ submitted ──▶ processing ──▶ completed ──▶ delivered
                │              │             │
                │              ▼             ▼
                │          uncertain ──▶ reconciling ──┐
                │              ▲                       │
                ▼              │                       ▼
           failed_clean ───────┘                   abandoned
```

| State | Meaning | May retry? | May fail over? |
|---|---|---|---|
| `failed_clean` | Provider refused **before** charging (any 4xx) | Yes | **Yes — the only such state** |
| `uncertain` | Timeout / 5xx / socket error; may be charged | No, never with a new key | **No** |
| `submitted` | Process died mid-request | No | No |
| `processing` | Provider working on it | No | No |
| `completed` | Purchased, payload captured, not yet handed over | — | — |
| `delivered` | Terminal; customer has the goods | — | — |
| `abandoned` | Admin declared it dead, with a reason | — | — |

All transitions live in [`ledger.ts`](../src/lib/suppliers/ledger.ts). Nothing
else may write the table.

## The two invariants

1. **Never dispatch without a claimed, dispatchable slot.** An existing row in a
   non-dispatchable state means a purchase already happened — or may have — so
   the correct action is to reconcile, not to buy.
2. **Never mint a new idempotency key.** The key is derived from the slot
   (`ghost-{orderId}-{orderItemId}-{slotIndex}`), is reproducible from the
   database alone, and is read back on every retry. A fresh key after a timeout
   is a second real charge.

Invariant 2 is why `buildIdempotencyKey` uses no clock and no randomness — it
must survive a process restart. Tested in
[`ledgerKeys.test.ts`](../test/suppliers/ledgerKeys.test.ts).

## Reconciliation

[`reconcile.ts`](../src/lib/fazercards/reconcile.ts) resolves ambiguous slots.
Two lookup routes:

1. **By provider order id** — authoritative, `GET /orders/{id}`.
2. **By scanning recent order history** for our key.

⚠️ Route 2 is a genuine limitation. FazerCards exposes **no documented way to
query an order by idempotency key**: `GET /orders` has no such filter and the
order object is untyped, so we cannot rely on the key being echoed back. The
only documented replay is re-POSTing the identical body with the same key, which
we deliberately do **not** do — reconstructing that body wrongly would place a
real second order.

Consequently `replayOrderByIdempotencyKey` **throws** when history cannot be
read, so an API outage is never mistaken for “no order exists”. It returns
`null` only after a successful read found nothing.

Backoff is exponential, capped at 30 min (FazerCards rate-limits order-status
reads at 120/min account-wide), bounded by `MAX_RECONCILE_ATTEMPTS = 24`, after
which the slot escalates to manual review.

## Failover rule

Only `failed_clean` and `blocked` permit trying a backup supplier
(`mayFailOver`). Failing over after an *uncertain* outcome means buying the same
product twice for one sale. Tested in
[`failoverSafety.test.ts`](../test/suppliers/failoverSafety.test.ts).

## Staging safety

FazerCards has no sandbox — every key is live. Safety therefore comes from
`FAZERCARDS_MODE`, which resolves to `live` **only** when the runtime is
production **and** the operator explicitly opted in. Everything else — unset,
misspelled, a preview deploy, a leaked key — resolves to `dry_run`, where order
placement is simulated and never dispatched. Tested in
[`modeGate.test.ts`](../test/fazercards/modeGate.test.ts).

## Scheduled jobs

| Route | Schedule | Does |
|---|---|---|
| `/api/cron/supplier-reconcile` | every 10 min | Resolve ambiguous slots, deliver completed ones, escalate stuck ones |
| `/api/cron/supplier-health` | every 2 h | Refresh account/subscription/balance; alert on low balance |

Both fail closed without `CRON_SECRET`, and both are idempotent — an overlapping
run finds the work already done.

## ⚠️ The unverified contract

`extractDeliveryFields` in
[`normalize.ts`](../src/lib/fazercards/normalize.ts) is **a tolerant guess, not a
contract implementation.** The official OpenAPI spec types the order object as
`{"type":"object","additionalProperties":true}` on both `GET /orders/{id}` and
`POST /giftcards/order`, and no completed-order example is published. There is
no documented answer to “which field carries the delivered code”, and no API key
was available to discover it empirically.

It is written to return `[]` — which callers turn into a hard error and a
manual-fulfilment instruction — rather than deliver an empty payload to a paying
customer.

**To finalise:** place one cheap real order, capture the raw JSON, add it as a
fixture in `test/fazercards/normalize.test.ts`, then narrow the function.
`sanitizeProviderSnapshot` records the *shape* of every response (with secret
values masked) precisely so this can be diagnosed from production data without
ever storing a code.

## What is not done

The ledger, engine, reconciliation, delivery, jobs and alerts exist and are
tested, but **`deliverOrder` has not yet been switched over to them**, so
production behaviour is currently unchanged. Also outstanding: catalog sync,
catalog admin browser, webhook receiver, auto-fulfil-on-payment, ops dashboard
surfacing, and the admin reconciliation controls.
