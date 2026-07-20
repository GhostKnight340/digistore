# Ghost.ma — Pre-Launch Audit

_Audit date: 2026-07-16 (updated same day, second pass: order-flow deep audit + fixes) · Branch: `staging` · Method: full read-only inspection of storefront, admin, payments/fulfilment, security, SEO/analytics/email/env, and search/guides/mobile, followed by Critical/High fixes._

> **Second-pass update (order flow):** the order IDOR (C-SEC-1/2) and the
> guest-checkout account-overwrite are now **FIXED** (per-order access token +
> `authorizeOrderAccess()` + DTO identity stripping + guest upsert no longer
> mutates existing accounts). Also fixed: wrong e-mail template for payment
> issues, proof re-request silently skipped, internal notes leaking as customer
> "Motif", delivery/confirmation races, manual-code reuse, multi-code Reloadly
> double-purchase guard, unconfigured PayPal hidden, USDT rate configurable,
> fake QR removed, live-update polling gaps. See the fix tables below.

This report is the launch-readiness record required by the pre-launch pass. It
lists findings by severity, what was fixed in this pass, and the blockers that
remain. Re-run the checklist in [`launch-readiness-checklist.md`](launch-readiness-checklist.md)
before each release.

---

## SUMMARY

**Launch decision: NOT READY.** Two Critical security findings (order IDOR / PII
enumeration) and one Critical operational configuration risk (staging Vercel env
vars pointing at live Reloadly + real email) remain open. None require a large
rebuild; they need one focused, staging-tested change and a Vercel env-var
scoping pass. The rest of the platform is in genuinely good shape — payments,
wallet, promo, auth hashing/sessions, and money math are well built.

> **Correction (2026-07-19).** C-SEC-1 and C-SEC-2 below were re-verified against
> the code during the launch-readiness audit and are **both fixed**. The counts in
> the table were accurate when written and are left as a historical record; the
> live blocker count is **1 Critical** (C-ENV-1, which needs Vercel dashboard work,
> not code). See `docs/launch-readiness-audit.md`.

| Severity | Open | Fixed this pass |
|---|---|---|
| Critical | 3 | 2 |
| High | 6 | 4 |
| Medium | ~10 | 4 |
| Low | several | — |

### Critical blockers (must clear before launch)

1. ~~**IDOR on order actions (C-SEC-1).**~~ **FIXED** — verified 2026-07-19 during
   the launch-readiness audit. `authorizeOrderAccess` (`src/lib/db/orders.ts:536`)
   now resolves and authorizes every state-changing reference, and is applied to
   `submitPaymentAction`, `changePaymentMethodAction` and `cancelOrderAction`
   (`src/app/actions/payments.ts:76,116,124`) plus both PayPal actions
   (`src/app/actions/paypal.ts:28,50`). The enumerable public order number alone
   never authorizes an action — only the secret `deliveryToken`, the unguessable
   internal cuid, or being the logged-in owner.
2. ~~**Order PII enumeration (C-SEC-2).**~~ **FIXED** — verified 2026-07-19. The
   `authorizedForIdentity` gate in `buildCustomerDTO` (`src/lib/db/orders.ts:212`)
   withholds `customerName`, `customerEmail` and the internal id whenever an order
   was resolved *only* via the sequential public number by a non-owner
   (`getCustomerOrder`, `orders.ts:518-521`). Delivered codes were already gated.

   **Residual (lesser) issue, not the original C-SEC-2:** a sequential public
   order number still confirms that an order *exists* and exposes its status,
   amount and item names. That is an existence oracle rather than a PII leak, and
   is tracked as Stage 1 work in `docs/launch-readiness-audit.md`.
3. **Staging env vars can transact for real (C-ENV-1).** The pulled preview env
   shows `RELOADLY_ENV="live"` and `ENABLE_REAL_EMAILS="true"` on a non-production
   deployment. Code guards were added (email allowlist, robots noindex, GA gating,
   startup warning), but **the Vercel `staging` environment must be reconfigured**
   to `RELOADLY_ENV=sandbox`, `PAYPAL_ENV=sandbox`, and an `EMAIL_TEST_ALLOWLIST`.
   The isolated staging Neon DB (set up 2026-07-15) is already correct.

### Recommended fix for C-SEC-1 / C-SEC-2 (single change)

The payment page is reached at `/payment/{publicOrderNumber}` — a guessable
sequential number — and the client reads the internal cuid from the DTO to call
the order actions. Guests have no session, so `isOrderOwner()` alone cannot
authorize them. Fix:

- Generate a per-order **access token** at creation (`deliveryToken` already
  exists on the schema as `@unique`, currently set at delivery — extend it to
  creation, or add an `accessToken`).
- Redirect checkout to `/payment/{token}` and use the token in the order emails.
- Authorize every order action and `getPaymentPageDataAction` by **session owner
  OR matching token**; strip `customerName`/`customerEmail`/internal `id` from
  the DTO for callers who are neither.

Scope is contained (checkout redirect, payment page, order emails, the four
actions, one DTO). Do it on a feature branch, test the full guest + logged-in
flow on staging, then ship.

---

## ENVIRONMENT STATUS

| Item | Status |
|---|---|
| Staging domain (`staging.ghost.ma` → Vercel `staging` custom env) | ✅ configured |
| Staging database isolation (own Neon `ep-green-pine-…`) | ✅ isolated (2026-07-15) |
| Production database guard (CLI write-guard) | ✅ present (`scripts/lib/db-guard.mjs`) |
| App-runtime prod-DB guard | ⚠️ none (relies on Vercel env scoping; startup warning added) |
| Payment/provider isolation (sandbox on staging) | ❌ `RELOADLY_ENV=live` on preview — **fix in Vercel** |
| Email isolation | ✅ code now gates on `VERCEL_ENV` + allowlist (this pass) |
| Analytics isolation | ✅ GA now production-only (this pass) |
| Staging noindex | ✅ robots disallow-all off-production (this pass) |
| Staging banner | ✅ added (this pass) |

**Root cause addressed:** there was no runtime notion of "staging" — every check
used `NODE_ENV`, which Vercel sets to `production` on all deployments. Added
[`src/lib/env.ts`](../src/lib/env.ts) (`isProductionRuntime()`,
`isPreviewDeployment()`, keyed on `VERCEL_ENV`) and routed email, robots, GA, and
the banner through it.

---

## CUSTOMER FLOW STATUS

| Stage | Status | Notes |
|---|---|---|
| Browse (home, catalogue, categories, collections) | ✅ | Clear, dynamic payment display, honest delivery copy |
| Search | ✅ (good) | Aliases, ranking, noindex correct. Added Netflix/Spotify aliases. No-result queries still not logged server-side (H) |
| Product page | 🟡 | Complete UX, but **no `generateMetadata` / Product JSON-LD** (SEO H3) and no stock state (M) |
| Cart / checkout | ✅ | Server-side re-pricing; no client-controlled totals/credit |
| Payment | ❌ | IDOR (C-SEC-1/2). Manual + PayPal flows otherwise solid |
| Fulfilment | ✅ (fixed) | **Paid-order queue truncation fixed this pass.** Reloadly idempotency ledger still recommended (H2) |
| Delivery | ✅ | Codes link-only, gated by token/owner; never in email |
| Account | ✅ | Session/ownership checks correct |
| Support / feedback | ✅ | Ownership enforced; feedback rate-limited |
| Trust / reviews | ✅ (fixed) | **Fake "verified" seeded reviews now hidden** this pass |

---

## OPERATIONS STATUS

| Area | Status |
|---|---|
| Admin auth gating (layout + per-action `requireAdminCustomer`) | ✅ |
| Customer admin (identity, orders, wallet, notes, sessions, audit) | ✅ complete, no secret leakage in DTO |
| Money/account admin actions audited + reason + confirm | ✅ |
| Admin dashboard action queues | 🟡 partial — only payment-review + out-of-stock surfaced; fulfilment/support/failed-email queues exist as data but not on the homepage (H) |
| Decorative no-op controls (date range, Export) | 🟡 present in `AdminOverview` — wire or remove (H) |
| Monitoring / error tracking | ❌ none (no Sentry). Email failures → Discord only (C-MON) |
| Emails | ✅ templates branded, DH, no code leakage; now env-gated |
| Discord notifications | ✅ |
| Refunds / wallet / promo | ✅ idempotent ledgers, reservation lifecycle correct |
| Unpaid-order expiration cron | ❌ none — abandoned orders leak promo/credit reservations (H/M) |

---

## SECURITY STATUS

| Control | Status |
|---|---|
| Password hashing (scrypt + salt + timingSafeEqual) | ✅ |
| Auth tokens (random, SHA-256 stored, single-use, TTL) | ✅ |
| Sessions (HMAC cookie, httpOnly, revocation anchor) | ✅ |
| Disabled-account handling | ✅ |
| Authorization — wishlist/wallet/promo/support (session-derived) | ✅ |
| **Authorization — order actions (IDOR)** | ❌ **C-SEC-1/2** |
| Rate limiting — password reset / register / verify resend | ❌ none (H-SEC-1) |
| Rate limiting — login | 🟡 in-memory, email-only, resets per serverless instance (H-SEC-2) |
| Rate limiting — feedback | ✅ DB-backed |
| Uploads — feedback attachment (public, unthrottled, client-MIME) | 🟡 M-SEC-1 |
| Uploads — admin (client-MIME, dev-only disk) | 🟡 M-SEC-2 |
| Google OAuth links unverified email | 🟡 M-SEC-3 |
| Webhook signature + idempotency + amount/currency | ✅ (PayPal verified idempotent) |
| Server-side money math, no client-controlled discount/credit | ✅ |
| Secret exposure (`NEXT_PUBLIC_`, responses, source maps) | ✅ clean |

---

## MOBILE STATUS

Audited by code/class inspection at the standard widths (320/360/375/390/430,
tablet, desktop). Safe-area insets, `100dvh` bottom sheets, hamburger, search
sheet, floating support/feedback buttons, and checkout sticky bar are all
**correctly implemented**. Two issues:

- **Global `overflow-x: hidden` on `html` + `body`** (`globals.css`) masks real
  overflow bugs and can break `position: sticky` — recommend removing and fixing
  the actual offender(s) (C-MOB, deferred: needs per-page verification).
- Region/denomination selector chips and qty steppers are ~36–40px, under the
  44px touch-target guideline (M-MOB).

---

## TESTS

- `npx tsc --noEmit` — ✅ passes.
- `npm test` — ✅ 238 pass / 0 fail (added: env detection, seeded-review exclusion).
- Build (`next build`) — run in CI/Vercel; migrations apply via `prisma migrate deploy`.
- Not automated (manual): full guest + logged-in payment flow, PayPal sandbox
  capture, Reloadly sandbox fulfilment, email allowlist behavior on staging.

---

## FIXED IN THIS PASS (safe, non-flow-breaking)

| # | Fix | Files |
|---|---|---|
| 1 | `env.ts` runtime environment helper (VERCEL_ENV-based) | `src/lib/env.ts` (new) |
| 2 | Email: real-send only in production, else `EMAIL_TEST_ALLOWLIST` | `src/lib/email/send-email.ts` |
| 3 | Robots: blanket noindex off-production | `src/app/robots.ts` |
| 4 | GA: production-only, env-configurable id; `lang="fr"` | `src/app/layout.tsx` |
| 5 | Staging banner ("données et paiements de test") | `src/app/layout.tsx` |
| 6 | Startup env self-check (non-throwing warnings) | `src/instrumentation.ts` (new) |
| 7 | Fulfilment queue: paid orders can no longer be truncated away | `src/app/actions/admin.ts` |
| 8 | Payment transitions: no terminal-order regression, atomic + idempotent | `src/lib/db/payments.ts` |
| 9 | Trust: seeded fake "verified" reviews never render | `src/lib/trust/content.ts` |
| 10 | Copy: `MAD` stat → `DH` | `src/lib/storeSettings.ts` |
| 11 | Search: Netflix + Spotify aliases | `src/lib/search/text.ts` |
| 12 | Tests for env detection + seeded-review exclusion | `test/env/`, `test/trust/` |

No schema migrations, no DB writes, no production deploy were performed.

---

## DEFERRED — prioritized follow-ups (with rationale)

**Do not close these silently.** Each is either too risky to land blind on the
live flow, or too large for a safe single pass.

### Critical / High (block or near-block launch)
- **[C] Order IDOR capability-token fix** (C-SEC-1/2) — see recommended fix above.
- **[C] Vercel `staging` env-var scoping** — `RELOADLY_ENV=sandbox`,
  `PAYPAL_ENV=sandbox`, `EMAIL_TEST_ALLOWLIST=<tester>` on the staging custom env.
- **[H] Error monitoring** — add Sentry (`instrumentation.ts` is already present)
  for server actions, the PayPal webhook, and cron handlers.
- **[H] Auth rate limiting** — shared-store limiter for reset/register/verify,
  and an IP dimension on login (current limiter is per-instance in-memory).
- **[H] Product page SEO** — `generateMetadata` + `Product`/`Offer` JSON-LD
  (note the page is a client component; add a server wrapper).
- **[H] Admin dashboard action queues** — surface fulfilment / support / failed
  emails / expiring unpaid; wire or remove the decorative range + Export controls.
- **[H] No-result search logging** — persist zero-result queries for admin review.
- **[H] Reloadly idempotency ledger** — per-`customIdentifier` record so a retry
  cannot double-purchase on multi-item orders.

### Medium
- Analytics ecommerce funnel (`view_item`/`add_to_cart`/`begin_checkout`/`purchase`).
- Unpaid-order expiration cron (release promo/credit reservations).
- Product stock/availability state on the PDP.
- Feedback-attachment upload: require session + rate limit + magic-byte sniffing.
- Google OAuth: only auto-link existing local accounts when `email_verified`.
- Soften remaining absolute trust claims ("100% officiels", "conformes aux
  standards bancaires", "meilleur prix").
- Product/route `error.tsx` + `loading.tsx`.

### Content / larger
- **Guides: zero exist.** Author the ~10 launch guides or hide the `/guides` nav
  until content lands (infra is production-quality and correctly gated).
- Global `overflow-x: hidden` removal + per-page overflow fix.
- Search typo tolerance (Levenshtein/trigram).

---

## LAUNCH DECISION

**NOT READY.** Clear the three Critical blockers (order IDOR fix + Vercel staging
env scoping), then re-run this audit and the launch checklist. Once those are
closed and error monitoring + auth rate limiting are in place, the realistic
status is **"Ready with accepted non-critical risks"** — the deferred Medium
items and the guides content are not launch-blocking for a soft launch, provided
the `/guides` link is hidden until content exists.
