# Launch readiness audit

Date: 2026-07-19 · Branch: `staging` · Scope: analytics, mobile UX, checkout, operations.

Method: static read of `src/`, `prisma/`, `test/`, `docs/`, `vercel.json`. No code was
modified, no database was touched, no migration was run. Every claim below carries a
`file:line` reference; where two sources disagreed, the code won and the disagreement is
recorded.

---

> **Status update — 2026-07-19.** Stage 0 and Stage 1 are implemented; see
> `docs/launch-implementation-summary.md`. Findings 1, 2, 3 and 5 below are
> **fixed**. Finding 4 is **partly addressed** (the build now type-checks before
> migrating; full decoupling is still open). Two corrections to this document's
> own analysis are recorded inline: C-SEC-2 was already fixed when this was
> written, and the proposed build reorder was wrong — see §6 Stage 0.
> **No migration has been created or run.**

## 0. Headline findings

Ghost.ma is much further along than the brief assumes. Sentry, GA4, a Discord alert
system, five authenticated cron jobs, a health module and an admin operations dashboard
all already exist and are, in places, better built than a from-scratch implementation
would be. The work is **closing gaps in existing systems**, not building new ones.

Five things outrank everything in the four workstreams:

| # | Finding | Where | Why it matters |
|---|---|---|---|
| 1 | Gift-card codes are written to Vercel logs | `src/lib/suppliers/providers/fazercards.ts:348` | An active secret leak, outside all scrubbing. Logs are retained and readable by anyone with project access. |
| 2 | Oversell is possible; stock ignores quantity | `src/lib/db/promoResolve.ts:57` | A variant with 1 code accepts an order for 100. Customer pays for codes that do not exist. |
| 3 | No idempotency on order creation | `src/lib/db/orders.ts:1137` | Duplicate orders are prevented only by a client-side disabled button. |
| 4 | `prisma migrate deploy` runs *before* `next build` | `package.json:7` | A build failure leaves production on **old code against a new schema**. No typecheck gate, no automated backup. |
| 5 | **Guest checkout does not exist** | `src/app/actions/orders.ts:44-49` | Directly contradicts Workstream 3B. See §3. |

**One correction to existing docs:** `docs/pre-launch-audit.md:38-45` lists C-SEC-1
(IDOR on order actions) as an open Critical blocker. **It is fixed.**
`authorizeOrderAccess` now guards `submitPaymentAction`, `changePaymentMethodAction` and
`cancelOrderAction` (`src/app/actions/payments.ts:76,116,124`) and both PayPal actions
(`src/app/actions/paypal.ts:28,50`). The audit doc is stale and should be corrected so
nobody re-does this work.

---

## 1. Analytics — Workstream 1

### Exists

- `src/lib/analytics.ts` — client module: `trackEvent`, `trackEcommerce`,
  `toAnalyticsItem`, `ANALYTICS_CURRENCY = "MAD"`. No-op safe when `gtag` is absent
  (SSR, dev, ad blockers), so callers never guard.
- `src/lib/analytics/purchase.ts` — server-side GA4 Measurement Protocol.
- `src/components/analytics/` — `TrackView`, `TrackItemList`, `TrackSectionView`, all
  using a `useRef` latch that survives React StrictMode double-invoke.
- Gate: `isProductionRuntime() && Boolean(gaId)` (`src/app/layout.tsx:88`), no fallback
  measurement ID. Staging and preview send nothing.
- Test coverage: `test/ops/analyticsPurchase.test.ts` (10 assertions on payload
  determinism, PII absence, env gating).

### Missing

Against the brief's 15-event list, **6 are not implemented**:

| Event | Status |
|---|---|
| `view_item` | Missing — comment-only at `analytics.ts:39`; docs claim it exists |
| `add_to_cart` | Missing — same |
| `payment_proof_submitted` | Missing |
| `checkout_error` | Missing — the catch branch at `CheckoutClient.tsx:305-308` sets error state and returns |
| `payment_method_changed` | Missing |
| `support_contact_clicked` | Missing (`feedback_support_redirect` is adjacent, not equivalent) |

`page_view` exists only implicitly via `gtag('config')` at `layout.tsx:108`.

Also missing: Meta Pixel (none anywhere — no `fbq`, no GTM); any provider abstraction
(the module calls `window.gtag` directly and hardcodes the GA4 endpoint server-side);
dev-mode logging; a debug mode; and any consent mechanism.

### Bugs and inconsistencies

1. **`docs/analytics-events.md` is materially wrong.** It asserts "if an event is not in
   this table, we do not send it" — roughly **35 undocumented events ship**, including
   `wishlist_toggle`, `share`, `faq_search`, `guide_toc_click`, `trust_section_viewed`
   and dynamically-named events from `CategoryFaq.tsx:61`, `GuideAccordion.tsx:34`,
   `TrackedLink.tsx:35`.
2. **The doc's setup checklist step 3 is stale** — it says to "add the one-line call
   site" for server purchase; it was added at `src/lib/db/fulfillment.ts:454`.
3. **Purchase fires on `delivered`, not "confirmed/delivered"** as documented. An order
   confirmed but never delivered sends no `purchase`. This is arguably correct for a
   manual-fulfilment shop, but the doc and the code disagree.
4. **The funnel will not join in GA4.** `fulfillment.ts:457` uses
   `item_id: variantId ?? productId`; `toAnalyticsItem` always uses `product.id`. For
   variant orders the server `purchase` carries a different `item_id` than every browser
   event in the same funnel — breaking exactly the invariant `purchase.ts:22-25` claims
   to uphold.
5. **"Once per visit" is really "once per mount."** `view_cart`, `begin_checkout` and
   `view_item_list` re-fire on client-side navigate-away-and-back.

### Privacy

- Purchase dedup is **GA4-side only**, keyed on `transaction_id` = internal order id.
  There is no DB marker (`grep analyticsSentAt|gaSent|purchaseSent` → nothing). In
  practice the atomic `updateMany` guard at `fulfillment.ts:431-436` means only one
  caller reaches the send, so this holds — but it is an emergent property, not a
  designed one.
- **No consent system at all.** GA4 loads unconditionally in production with no opt-in
  or opt-out. For a storefront serving Morocco (loi 09-08) and EU visitors this is a
  real gap, already flagged in `docs/launch-backlog.md`.
- The internal order id is used as `transaction_id` where `deliveryToken`-free public
  references exist. Low risk (GA4 is not public) but contrary to the brief's rule.

---

## 2. Mobile UX — Workstream 2

### Exists

- Correct `viewport` export with `viewportFit: "cover"` and no
  `maximum-scale`/`user-scalable=no` anti-pattern (`src/app/layout.tsx:41-47`).
- `.container-page` handles bottom safe area (`globals.css:171`).
- `src/hooks/useIsMobile.ts` — SSR-safe, breakpoint 860px.
- Two correctly-built dialogs to copy from: `ActionDialog.tsx:85` and
  `FeedbackDialog.tsx:189` (`max-h-[100dvh] overflow-y-auto` + bottom-sheet rounding).
- Four admin panels already have card fallbacks for tables (`PromoCodesPanel.tsx:251`,
  `ClientsListView.tsx:162`, `FulfillmentPanel.tsx:163`, `FeedbackListView.tsx:117`).
- `src/app/payment/[id]/page.tsx` is genuinely mobile-first: collapsible summary,
  fixed CTA with `pb-[104px]` clearance, mobile/desktop tab variants.

### Two root causes explain most defects

1. **There is no `Modal`/`Dialog` primitive.** `src/components/ui/` has only
   `Checkbox`, `Drawer`, `PasswordField`, `SegmentedControl`, `ToggleSwitch`. Every
   dialog is hand-rolled, and 10+ of them omit `max-h` + `overflow-y`.
2. **`.btn` / `.input` / `.chip` encode no minimum height** (`globals.css:174-193`).
   `.btn` ≈ 40px, `.chip` ≈ 26px — all below the 44px iOS guideline. `.input` at
   `text-sm` (14px) triggers **iOS auto-zoom on every form field in the app**.

### Ranked defects

| # | Defect | Evidence |
|---|---|---|
| 1 | `SupportPill` (z-40) floats over the checkout and payment fixed CTA bars (z-30) on mobile | `SupportPill.tsx:21` guards only `/support` and `/admin`; `FeedbackButton.tsx:30-31` correctly excludes checkout/payment |
| 2 | Payment page modals `overflow-hidden` with no `max-h` — confirm button unreachable on short viewports | `payment/[id]/page.tsx:768,831` |
| 3 | Same omission in 6 more dialogs | `ProductsPanel.tsx:952`, `PaymentMethodsPanel.tsx:516`, `AddMethodDialog.tsx:18`, `DevOrderListTools.tsx:86`, `DeliveredOrderDiscord.tsx:147`, `DiscordConnection.tsx:269` |
| 4 | 8 admin tables with zero mobile fallback | `PaymentsPanel.tsx:118`, `InventoryPanel.tsx:597`, `CustomersPanel.tsx:79`, `PricingPanel.tsx:240`, `ExpensesPanel.tsx:273,493`, `SupplierLogsView.tsx:136`, `ActivityLogView.tsx:121`, `CustomerDetailView.tsx:494,543` |
| 5 | `ReloadlyImporter` forces 960–1000px horizontal scroll | `ReloadlyImporter.tsx:253,1036,1160` |
| 6 | Payment CTA bar ignores the iOS home indicator (`pb-5` flat) | `payment/[id]/page.tsx:753`; checkout got this right at `CheckoutClient.tsx:589` |
| 7 | iOS auto-zoom on all inputs (14px) | `globals.css:187` |
| 8 | Cart quantity steppers ≈30px; remove control ≈16px | `cart/page.tsx:136,148,109` |
| 9 | Admin action rows systematically `h-7`/`h-8` | `VariantSupplierSection.tsx:314+`, `MilestonesPanel.tsx:257+`, `PromoCodesPanel.tsx:327+` |
| 10 | Cart has no sticky mobile CTA — checkout button sits below the whole item list | `cart/page.tsx:188` |
| 11 | `100vh` where mobile Safari mis-measures | `AdminShell.tsx:496,515`, `guides/[slug]/page.tsx:474`, `global-error.tsx:31` |
| 12 | `ModalShell` uses `90vh` not `90dvh` | `OrderDetailPage.tsx:1274-1300` |
| 13 | `OrderDetailPage` ships a whole responsive system as an inline `<style>` string with 1120/720/640px breakpoints matching nothing | `OrderDetailPage.tsx:486-502`; modals hardcode `1fr 1fr` at `:910,973` |
| 14 | `Drawer` primitive has no `overflow-y` and no safe-area padding | `ui/Drawer.tsx:42` |
| 15 | `.cathero` `min-height: 720px` + `100vw` — taller than the viewport on 721–1024px tablets | `globals.css:~290`, released only at `max-width: 720px` (`:510`) |

**Structural caveat:** `html { overflow-x: hidden }` (`globals.css:17`) globally *masks*
horizontal overflow rather than preventing it, and `.cathero`'s `100vw` full-bleed
depends on it. Real overflow bugs are invisible in this codebase. Removing the mask is
not safe without fixing `.cathero` first.

---

## 3. Checkout — Workstream 3

### The brief's premise is wrong on one point

**Guest checkout does not exist.** `src/app/actions/orders.ts:44-49` hard-rejects
unauthenticated callers, and `CheckoutClient.tsx:266-272` blocks submit when not logged
in. Account creation is **mandatory**, not the optional "Créer un compte" the brief
describes. Workstream 3B as written would mean *reintroducing* guest checkout — a
significant behavioural change with knock-on effects on order ownership, the
`Order.customerId`-nullable enumeration problem, and email verification.

This needs your decision before any 3B work. See §7.

### Exists and is solid

- **Price re-validation is real.** `resolveCartLines` (`promoResolve.ts:39-113`)
  re-reads `priceMad` from the DB for every line. Client prices are never trusted.
  Parent products with active variants are excluded from direct purchase (`:66`).
- Partial orders refused wholesale (`orders.ts:1173`).
- Ordering kill switch is triple-layered (action, DB, page).
- Promo + Ghost Credit applied inside the transaction with server-side re-capping and a
  ledger `idempotencyKey` (`orders.ts:1194-1323`).
- Payment methods are **DB-driven**, not hardcoded — `getPublicPaymentMethods`
  (`paymentMethods.ts:122`) filtered by `isUsable` (`:101`).
- Account data is prefilled and read-only with a "Modifiez-les depuis votre profil" note
  (`CheckoutClient.tsx:64-65,381-382`) — the brief's requirement A is already met.
- Region compatibility warning with an explicit confirmation checkbox gating the CTA
  (`RegionBlock`, `CheckoutClient.tsx:814-884`).

### Missing / broken

1. **Oversell (highest severity).** `isVariantPurchasable` returns true on
   `unusedCodes > 0` (`promoResolve.ts:57`) — a **boolean check, never against requested
   quantity**. No reservation or decrement at order creation, so N concurrent customers
   can each buy the same last code. Parent-level products get **no stock check at all**
   (`:59-72`).
2. **No idempotency and no rate limit on order creation** (`orders.ts:1137`). `rateLimit`
   is imported and used for `findOrderAction` in the same file (`:113-116`) but not here.
3. **Non-atomic register→order.** `registerAndCreateOrderAction` (`checkoutAuth.ts:141`)
   — the atomic path — is **dead code, never called**. The shipped flow is two-step, so
   a failure leaves an account with no order.
4. **Order summary omissions** vs the brief: no unit price per line (the cart page has
   it, checkout does not), no variant/platform as distinct fields, no delivery ETA
   (checkout says only "Gratuit"), no currency code (hardcoded `" DH"` with an `en-US`
   grouping locale, `format.ts:10-12`).
5. **Quantity cap mismatch.** `StoreContext.tsx:104-114` clamps only the lower bound; the
   cart "+" button reaches 101+, then fails server-side with a generic French error.
6. **Invisible cart lines are still submitted.** The summary and total skip items whose
   product failed to load (`CheckoutClient.tsx:688`, `StoreContext.tsx:123-131`) but
   `handleSubmit` sends the full cart (`:283`). The user is told an item is unavailable
   while seeing no such item. Fails safe, reads as a bug.
7. **Zero test coverage on the money path.** `test/checkout/` contains one file covering
   only email-verification logic. No test for `createOrder`, `resolveCartLines`, the
   quantity cap, or `announcedPaymentMethods`.

### Payment page

Strong. Polling stops correctly on terminal statuses (`page.tsx:96`,
`orderStatus.ts:106`); "Changer de moyen de paiement" is gated server-side on
`status === "pending_payment"` with a conditional `updateMany` (`payments.ts:168,187`);
"Renvoyer un justificatif" is a **real upload**, not a WhatsApp deflection
(`RESUBMITTABLE_STATUSES`, `payments.ts:56`) — the WhatsApp link is a correctly-scoped
secondary path for PayPal/card orders.

Defects: copy feedback shows success even when the copy failed (`page.tsx:217` swallows
the rejection); polling has no backoff and no `visibilitychange` pause, hitting three DB
queries every 5s on an idle tab; three internal links route by public order number
rather than the token the customer arrived with (`page.tsx:1519,1612,1775`), so a
delivered-order customer **can lose access to their own codes by clicking "Suivre ma
commande"**; no QR for crypto (a documented deliberate gap at `page.tsx:1141-1143`).

### Proof upload

Stored as **base64 in Postgres** (`PaymentProof.data`), not Vercel Blob — the brief's
assumption about Blob proofs is wrong. Retrieval is admin-gated
(`getPaymentProofAction`, `actions/payments.ts:249`); there is no public proof route.

Three validation layers disagree: client 5MB + MIME **and** extension (`page.tsx:1990`),
action 5MB + MIME **or** extension (`actions/payments.ts:100`), DB layer 7MB of *base64*
≈ 5.25MB raw (`lib/db/payments.ts:77`) with an error message saying "Maximum 5 Mo". No
magic-byte sniffing anywhere; admin renders PDFs in an `<iframe>`
(`OrderDetailPage.tsx:808`).

### Order lifecycle — verbatim status names

No Prisma enum; `Order.status` is a free `String` (`schema.prisma:490`). The authoritative
union (`src/lib/types.ts:270-278`):

```
pending_payment | payment_submitted | payment_confirmed | payment_issue
| rejected | delivered | refunded | cancelled
```

Three **legacy values are still handled in UI code but absent from the union**:
`pending`, `awaiting_payment`, `processing` (`orderStatus.ts:3-8,65-69`). Divergence risk.

### Code exposure — clean

I found **no path where a delivered code is exposed before `status === "delivered"` plus
token-or-owner authorization.** The gate is at the DTO layer, which is the right place
(`buildCustomerDTO`, `orders.ts:232-234`); codes never enter the client payload
otherwise. Emails deliberately omit codes and send a `deliveryToken` URL
(`emailTemplates.ts:345,550`). This area was clearly hardened deliberately.

---

## 4. Operations — Workstream 4

### Exists (more than the brief assumes)

- **Sentry fully wired and inert.** `next.config.mjs:23-28`, `instrumentation.ts:24-54`,
  `instrumentation-client.ts:14-45`, `src/lib/monitoring/sentry.ts`. No DSN is set
  anywhere, so it is a no-op — intentional and documented. `sendDefaultPii: false`,
  `tracesSampleRate: 0`.
- **The scrubber is genuinely thorough** (`sentry.ts:29-101`): key-name matching anywhere
  in the event tree for passwords/secrets/tokens/cookies/gift-card+activation+voucher
  codes/proofs/email/phone/address, plus any inline `data:...;base64,` blob; strips
  `request.cookies` wholesale; depth-capped at 8. Tested — `test/ops/sentryScrub.test.ts`.
- **Health module** `src/lib/ops/health.ts` — 9 checks (DB, email, Discord, storage,
  payments, auth, website, cron, suppliers) each individually deadlined via
  `withHealthTimeout` (2500ms), which degrades to `"unknown"` and **never fabricates
  `healthy`**.
- **Public health endpoint** `src/app/api/health/route.ts` — deliberately minimal
  (`{status, version}`), unauthenticated by design, 503 when offline, `no-store`.
- **Discord alerting** via bot REST API (not webhooks). 8 env-configured channels
  (`discord/channels.ts:29-62`), fail-closed enablement (`config.ts:58-63`), order/support
  threads, ~14 notify functions.
- **Supplier alerts have real dedup + cooldowns + severity** (`discord/supplierAlerts.ts`)
  — 13 keys, per-key cooldowns from 5min to 24h.
- **All 5 crons authenticate correctly and fail closed** — missing `CRON_SECRET` → 503,
  wrong bearer → 401. Verified in all five routes.
- **Email failure alerts on all three failure paths** (`send-email.ts:231,263,292` →
  `notifyEmailFailure`). Best-covered failure path in the system.
- **Admin operations dashboard** `/admin/operations` — 12 parallel data sources, health
  chips, a warning engine, KPIs, order pipeline, supplier cards, wallet float.
- Supplier **balance reads exist** (`reloadly/operations.ts:270-276`) with threshold
  alerting via the 2-hourly `supplier-health` cron.

### Missing / broken

| # | Gap | Evidence |
|---|---|---|
| 1 | **Gift-card codes logged to Vercel logs** — up to 2KB of raw supplier response, outside all scrubbing | `fazercards.ts:348` |
| 2 | **No cron failure alerting.** All 5 handlers only `console.error` and return 500. A cron 500ing every run is invisible. | all `api/cron/*/route.ts` catch blocks |
| 3 | **No cron last-run tracking**, so a silently-dead cron is undetectable | no model in `schema.prisma` |
| 4 | **`getJobsStatus` fabricates a green light** — `cronStatus = onVercel ? "healthy" : "unknown"` with zero execution evidence, contradicting `checkCron` in the *same dashboard* | `ops/overview.ts:172-176` |
| 5 | Same function lists **2 of 5 crons** — omits `supplier-reconcile`, `supplier-health`, `expense-review` | `ops/overview.ts:175-176` |
| 6 | **No stuck-order push alert.** `waitingTooLong` (`ops/metrics.ts:32,58`) is dashboard-pull-only. Nothing at all watches `payment_confirmed`-but-undelivered — paid, nothing received. The `order_stuck` alert key is **declared and never fired** (`supplierAlerts.ts:33`). | |
| 7 | **No logger module.** 93 raw `console.*` calls in `src/lib` + `src/app/api`; no levels, no correlation id, no redaction. `Sentry.captureException` is **never called from application code**. | |
| 8 | The scrubber is Sentry-only — no shared sanitizer for logs, Discord payloads or API errors | |
| 9 | Balance-read failures silently swallowed (bare `catch {}`); two divergent threshold sources (hardcoded `10`/`50` vs `DEFAULT_BALANCE_THRESHOLDS`) | `supplierJobs.ts:135-138,167-168` |
| 10 | Supplier alert cooldowns are an **in-memory `Map`** — best-effort on recycling serverless processes | `supplierAlerts.ts:54` |
| 11 | `notifyEmailFailure` forwards a raw customer email into Discord — PII the Sentry scrubber would have redacted | `notify.ts:554-568` |
| 12 | No cooldown on `notifyEmailFailure` — a Resend outage = one Discord message per attempt | |
| 13 | `notifyDailySummary` is dead code — no callers, no cron | `notify.ts:584` |
| 14 | Severity exists but drives no routing — every supplier alert is a red embed in one channel | `notify.ts:544-548` |
| 15 | No test coverage for cron auth, alert dedup, or the health route | |

### Environment validation

`src/lib/env.ts` is **not** a validation module — it is a runtime *detector*
(`runtimeEnv`, `isProductionRuntime`, `isPreviewDeployment`, `runtimeEnvLabel`). Its
header correctly documents that Vercel sets `NODE_ENV="production"` on every deployment,
making `VERCEL_ENV` the only authoritative signal.

There is **no schema validation anywhere** — no zod/envalid, no required-variable
manifest, no throw-on-missing at boot. The one startup check (`instrumentation.ts:59-98`)
is **gated to preview deployments only** (`:60`) and deliberately never throws.

**The check is inverted relative to risk:** preview gets a startup audit; production —
where a missing `CRON_SECRET` or `AUTH_SECRET` is fatal — gets nothing. It does correctly
never print secret values (presence tests and literal comparisons only).

**`NEXT_PUBLIC_` discipline is airtight.** Nine public vars, all URLs / support address /
vendor public identifiers. `PAYPAL_CLIENT_SECRET`, `GA_API_SECRET` and
`SENTRY_AUTH_TOKEN` are correctly unprefixed. This is a genuine strength.

### Database and backups

Neon Postgres, pooled `DATABASE_URL` + non-pooled `DIRECT_URL` (`schema.prisma:12-13`).
No pooling config in code — bare `new PrismaClient()` (`db/prisma.ts:11`).

**There is no backup script and no `pg_dump` anywhere in the repo.** Backup posture rests
entirely on Neon's built-in PITR plus a human remembering a manual checklist item
(`release-process.md:23`). Since `prisma migrate deploy` runs automatically on every
production deploy, the manual checkpoint is precisely the step most likely to be skipped
— the automated path never prompts for it.

The **manual** escape hatch is well built: `scripts/prod-op.mjs` loads only
`.env.production.local`, force-sets `GHOST_DB_ENV=production` so the guard cannot be
fooled, classifies write ops, requires `CONFIRM_PRODUCTION_DB=true`, and never prints
connection strings. The irony is that the manual path has two-factor protection while
every `git push` has none.

### Testing

`npm test` → Node's built-in runner via `tsx`. 46 test files across 23 directories, all
**pure-function, no DB** (self-documented in `docs/db-safety.md`).

**There is no `typecheck` script.** Type checking happens only inside `next build` —
which runs *after* `prisma migrate deploy`. This is the concrete mechanism by which a
type error leaves production migrated but un-deployed. `tsconfig.json` has `strict: true`
but not `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`.

---

## 5. Security and privacy summary

| Severity | Finding | Location |
|---|---|---|
| **High** | Gift-card codes in Vercel logs | `fazercards.ts:348` |
| **High** | Oversell — stock never checked against quantity, no reservation | `promoResolve.ts:57,59-72` |
| **Medium** | Order-number enumeration throttled but not closed; rate limiter is a per-process `Map`, so a parallel attacker gets `limit × instance count` | `rateLimitCore.ts`, acknowledged at `actions/orders.ts:98-102` |
| ~~Medium~~ | ~~Order PII returned via sequential public order number — C-SEC-2~~ **This entry was wrong when written.** The `authorizedForIdentity` gate already withheld name/e-mail/internal id. The real residual — a bare public number still confirming an order *existed* and leaking status/amount/item names — was **fixed in Stage 1**: it now returns `null`. | `orders.ts:486-526` |
| **Medium** | No consent system; GA4 loads unconditionally in production | `layout.tsx:85-113` |
| **Medium** | Customer email forwarded into Discord alerts | `notify.ts:554-568` |
| **Medium** | Staging shares single Vercel env vars with production — `RELOADLY_ENV=live`, real money. C-ENV-1, **still open**, requires dashboard work | `docs/pre-launch-audit.md:52-58` |
| **Low** | No magic-byte sniffing on uploads; admin renders PDF proofs in an `<iframe>` | `OrderDetailPage.tsx:808` |
| **Low** | Token-downgrading internal links cost customers access to their own codes | `payment/[id]/page.tsx:1519,1612,1775` |
| **Low** | Cron secret compared with `!==`, not timing-safe | all cron routes |

Confirmed **clean**: `NEXT_PUBLIC_` secret discipline; delivered-code exposure gating;
proof access control; cron fail-closed auth; payment-action IDOR (fixed).

---

## 6. Proposed implementation plan

Ordered so that each stage is independently reviewable, shippable, and reversible.
Nothing here migrates production.

### Stage 0 — Stop the bleeding (no schema, ~1 file each)

| Change | File |
|---|---|
| Remove the raw payload dump; log field *names* and a safe error code only | `fazercards.ts:348` |
| Add `/checkout` and `/payment` to the SupportPill route guard | `SupportPill.tsx:21` |
| Add `"typecheck": "tsc --noEmit"` | `package.json` |
| Reorder build to `generate && next build && migrate deploy` | `package.json:7` |
| Correct the stale C-SEC-1 entry | `docs/pre-launch-audit.md` |

### Stage 1 — Checkout correctness (no schema)

- Quantity-aware stock check + parent-product inventory gating (`promoResolve.ts`).
- Clamp quantity at the `StoreContext` layer to match the server cap.
- Submit only resolvable cart lines, or surface the unresolvable ones by name.
- Rate-limit `createOrderAction` reusing the existing `rateLimit`.
- Delete or wire up the dead `registerAndCreateOrderAction`.
- Order summary: unit price, variant, platform, delivery expectation.
- Tests for every one of the above — this is the untested money path.

### Stage 2 — Analytics completion (no schema)

- Add the 6 missing events at their natural call sites.
- Introduce a thin provider registry so Meta Pixel is a registration, not a rewrite.
- Dev-mode logging + `NEXT_PUBLIC_ANALYTICS_DEBUG`.
- Fix the server/browser `item_id` mismatch (`fulfillment.ts:457`).
- Rewrite `docs/analytics-events.md` to match reality; add `docs/analytics-setup.md`.

### Stage 3 — Mobile (no schema)

- Extract a `Modal` primitive from `ActionDialog`; migrate the 8 broken dialogs.
- Add `min-h-[44px]` to `.btn`, 16px to `.input`, size up `.chip`.
- Card fallbacks for the 8 tables, reusing the `PromoCodesPanel` pattern.
- Safe-area on the payment CTA; `vh` → `dvh`; sticky cart CTA.
- `docs/mobile-qa-checklist.md`.

### Stage 4 — Operations (no schema)

- Centralized `src/lib/log.ts` reusing the **existing** `scrubEvent` sanitizer.
- Cron failure → Discord + Sentry, wrapping all five handlers.
- Fix `getJobsStatus` — remove the fabricated `healthy`, list all 5 crons.
- Persist alert cooldowns (replaces the in-memory `Map`).
- Stuck-order detector including `payment_confirmed`-but-undelivered; fire the
  already-declared `order_stuck` key.
- Production branch of the env self-check (presence only, never values).
- Admin "État du système" panel — extend the existing dashboard, do not build a new one.
- `docs/database-backup-and-recovery.md`, `docs/operations-runbook.md`, backup scripts.

### Stage 5 — Requires your decision (see §7)

Guest checkout, consent system, C-SEC-2 identity gating, alert-cooldown persistence
model.

---

## 7. Decisions I need from you

1. **Guest checkout.** It does not exist. Reintroducing it is a real behavioural change
   touching order ownership and the enumeration problem. Options: (a) leave accounts
   mandatory and I drop 3B, (b) implement guest checkout as a separate, carefully-scoped
   piece of work.
2. **Database changes.** Four improvements want schema: cron last-run tracking,
   durable alert cooldowns, purchase-sent marker, and the `SupplierPurchaseAttempt`
   ledger already deferred in `launch-backlog.md`. All are additive. Per your rules I
   will not migrate production — I would author migrations and you run them via the
   existing `npm run prod:migrate` guard. Confirm before I write any.
3. **Consent.** Minimum compliant approach is a non-blocking banner defaulting analytics
   off until accepted. This *will* reduce measured conversions. Confirm you want it.
4. **Scope.** Stage 0+1 alone materially de-risk launch. Stages 2–4 are larger. Tell me
   if you want them in one pass or as separate reviewable batches.

---

## 8. Files expected to change

Stage 0: `fazercards.ts`, `SupportPill.tsx`, `package.json`, `docs/pre-launch-audit.md`.
Stage 1: `promoResolve.ts`, `StoreContext.tsx`, `CheckoutClient.tsx`, `actions/orders.ts`,
`db/orders.ts`, `checkoutAuth.ts`, + new `test/checkout/*`.
Stage 2: `lib/analytics.ts`, new `lib/analytics/providers/*`, `layout.tsx`,
`CheckoutClient.tsx`, product/cart/payment components, `fulfillment.ts`, docs.
Stage 3: `globals.css`, new `ui/Modal.tsx`, 8 admin panels, `cart/page.tsx`,
`payment/[id]/page.tsx`, `ui/Drawer.tsx`, docs.
Stage 4: new `lib/log.ts`, new `lib/ops/alerts.ts`, 5 cron routes, `ops/overview.ts`,
`instrumentation.ts`, `discord/supplierAlerts.ts`, admin operations components,
new `scripts/db-backup.mjs` + `scripts/db-restore.mjs`, docs.

## 9. Database changes

**None proposed without your approval.** Four additive candidates listed in §7.2.
No destructive operation is contemplated anywhere in this plan.

## 10. External configuration required

| Service | Action | Blocks |
|---|---|---|
| Sentry | Create project; set `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry stays inert (harmless) |
| GA4 | Create property; set `NEXT_PUBLIC_GA_ID` + `GA_API_SECRET` (Measurement Protocol) | All analytics |
| Meta | Create Pixel; set `NEXT_PUBLIC_META_PIXEL_ID` | Meta events |
| Vercel | **Scope staging env vars separately from production** — C-ENV-1, still open | Real money on staging |
| Neon | Confirm PITR retention on the current plan | Backup doc accuracy |
| Discord | No new channels needed — reuse `systemAlerts` | — |
| Uptime | External monitor against `/api/health` | Outage detection |
