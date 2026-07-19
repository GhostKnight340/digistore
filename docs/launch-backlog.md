# Launch backlog — deliberately not done in the pre-launch pass

Each item says why it was deferred. Nothing here is silent: these are known,
accepted risks or work that needs a decision, a credential, or a migration.

## Fixed — recorded because the cause is non-obvious

### Soft 404s (`notFound()` returning HTTP 200) — FIXED 2026-07-18
`/products/does-not-exist` and `/guides/nope` rendered the not-found UI with
status **200**, so search engines would index dead URLs.

**Cause:** a `loading.tsx` creates a Suspense boundary; Next streams the fallback
immediately, flushing headers with 200, so a later `notFound()` can no longer
set 404. It was *not* the middleware and *not* `force-dynamic` (both ruled out
empirically — an isolated probe page on the same root layout returned 404
correctly). The trap is that a **parent** segment's `loading.tsx` also wraps its
children, so `app/products/loading.tsx` broke `app/products/[id]` too — removing
either level alone changed nothing, which is why it looked unrelated at first.

**Fix:** removed `loading.tsx` from `app/products`, `app/products/[id]`,
`app/guides` and `app/guides/[slug]`. Verified in a production build: those
routes plus `/collections/nope`, `/categorie/nope` and an unmatched path all
return 404, while real pages still return 200.

**Guard:** `test/routing/notFoundStatus.test.ts` walks every `page.tsx` that
calls `notFound()` and fails if any `loading.tsx` shadows it at any ancestor
level. `app/admin` is exempt — authenticated and never crawled, so the loading
state is worth more there than the status code.

**To reclaim streaming** on those routes, put a `<Suspense>` *inside* the page,
below the `notFound()` decision, rather than using `loading.tsx`.

## Accepted risks — decided, not outstanding

### Live PayPal + Reloadly on staging (accepted 2026-07-18)
`PAYPAL_ENV`, `RELOADLY_ENV` and both client secrets are **single Vercel
variables spanning Production + Preview + staging**, so staging cannot differ
from production. The values are live. This is a deliberate decision (no sandbox
accounts exist); it is not a misconfiguration to be "fixed".

Consequences, so nobody rediscovers them the hard way:
- A staging order captures **real** PayPal money and needs a **real** refund.
- A staging fulfilment spends **real** Reloadly balance.
- `staging.ghost.ma` currently returns HTTP 200 and serves the full storefront
  with **no authentication**, so this exposure is reachable by anyone with the
  URL — it is noindexed, but the hostname is guessable.

**Required mitigation:** keep the ordering kill switch OFF on the staging
database except while actively testing. It is enforced at page, server action
and DB level and strips `config.methods`, so payment details cannot even be
enumerated while it is off. Optionally add Vercel Deployment Protection on the
staging environment (Pro plan) for defence in depth.

Email is *not* affected: `EMAIL_TEST_ALLOWLIST` is scoped to Preview + staging,
so only allowlisted testers receive staging mail. Analytics is not affected
either: the purchase sender is gated on `isProductionRuntime()`, so the
Preview-scoped `GA_API_SECRET` cannot pollute the live GA property.

`FAZERCARDS_*` is absent from Vercel entirely — no live-money risk, but
FazerCards is also not usable in any deployed environment despite being fully
implemented.

## Blocking-adjacent — decide before opening to real traffic

### 1. Order-lookup enumeration is throttled, not closed
`findOrderAction` now has IP + email rate limits and a uniform response, but the
limiter store is a per-process `Map` (`src/lib/rateLimitCore.ts`). On Vercel each
cold instance starts empty, so a parallel attacker gets roughly
`limit × instance count`. **Treat the oracle as mitigated, not eliminated.**

Two real fixes, both needing a decision:
- Require a session on `findOrderAction`. Kills it outright with no migration —
  blocked only because `Order.customerId` is nullable and legacy guest orders
  still use this path. If those can be backfilled or sunset, do this.
- A durable counter store (Redis/KV, or a migration for a limiter table).

### 2. Supplier purchase idempotency ledger
Reloadly now does a pre-purchase lookup by `customIdentifier` and classifies
uncertain failures (timeout/5xx) so an admin cannot blindly retry a purchase that
may already have spent the wallet. What is still missing is the **persisted
ledger** (`SupplierPurchaseAttempt`: scope, status `pending|confirmed|uncertain`,
written *before* the HTTP call) so a process crash leaves a durable marker.
Deferred because it needs a schema migration and the working `DATABASE_URL`
points at production.

**Do not remove the guard at `src/lib/db/fulfillment.ts` that refuses deliveries
containing more than one supplier-sourced entry** — it is what currently holds
the blast radius to a single item.

## Medium

- **PayPal webhook signature uses a re-serialized body.** `req.text()` should be
  passed through verbatim instead of `req.json()` → re-`stringify`. Fails
  *closed*, so this is an availability risk (spurious verification failures),
  not a security hole. Not changed because getting it wrong breaks working
  verification; needs a sandbox test.
- **Email retry queue.** Send failures are logged and pinged to Discord but
  never retried. A transient Resend 5xx during order creation means the customer
  silently never gets payment instructions.
- **No consent architecture.** GA4 loads unconditionally in production. Needed if
  you take EU traffic.
- **Images.** `next/image` is used in 0 files; there are 22 raw `<img>` tags, and
  production product images are base64 data URIs **stored in the database**, so
  they cannot be CDN-optimized and travel inside cached DTOs. This is the single
  biggest performance item and a structural change.
- **`force-dynamic` on the root layout** opts the entire site out of static
  rendering. Related to item 1.
- **Payment page polls every 5s** with no backoff or cap, including on terminal
  `rejected` states.
- **Trust copy lives in the database.** The code defaults were corrected
  ("Produits 100 % officiels" → "sources vérifiées"), but the live site still
  renders the old strings because `StoreSetting` rows win. **Update these in the
  admin settings UI** — the code change alone does nothing for the existing
  install.
- **Dead email templates** `email_confirmation` and `awaiting_payment` — wire or
  remove. The latter means there is no unpaid-order reminder.
- **Refund-completed email** — `refund_update` covers both initiated and
  completed with one admin-composed template.
- **Feedback attachment cap is global, not per-caller** (no IP column on the
  model), so saturating it blocks legitimate uploads. A DoS-by-cap trade.
- **Unpaid-order expiration cron** — abandoned orders hold promo/credit
  reservations indefinitely.
- **Account order history does not live-update** (only `/payment/[id]` polls).

## Low

- `checkWebsite` health check is tautological (if it runs, the site is up).
- `checkCron` reports `unknown` — there is no last-run tracking to check against.
- Google OAuth links to an existing password account without requiring
  `email_verified`.
- Admin/feedback uploads validate magic bytes now; the admin upload route still
  trusts client MIME in one path.
- Global `overflow-x: hidden` on `html`+`body` (`globals.css`) masks real
  overflow bugs at 320px rather than surfacing them.
- Dead code path: `registerAndCreateOrderAction` /
  `createVerifiedAccountAndOrder` have no callers.
- Region switch on the PDP resets the selected denomination.

## Test coverage still missing

Added this pass: supplier purchase-outcome classification, FazerCards preview
guard, order-status presentation, rate limiter, health timeout, analytics
purchase payload, Sentry scrubbing, stock availability.

Still uncovered: payment webhook idempotency, checkout duplicate prevention,
price revalidation end-to-end, order ownership, code delivery authorization,
hidden-product exclusion at checkout. These need a test DB or Prisma mocking —
the current suite is pure-function only (`node --test`, no DB).
