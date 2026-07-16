# Ghost.ma — Launch & Release Readiness Checklist

Reusable checklist for: **first launch**, **major production releases**, **after
incidents**, and **after payment/provider changes**. Copy the relevant sections
into the release PR and mark each item.

**Status legend:** `[ ]` Not checked · `[x]` Passed · `[!]` Failed · `[–]` N/A
Add ` — <note> (checked: YYYY-MM-DD, by: <name>)` after any non-trivial item.

See also: [`pre-launch-audit.md`](pre-launch-audit.md) (current findings),
[`release-process.md`](release-process.md), [`smoke-test.md`](smoke-test.md),
[`manual-test-checklist.md`](manual-test-checklist.md).

---

## 1. Environment
- [ ] Production is `VERCEL_ENV=production` on `ghost.ma`; staging is the `staging` custom env on `staging.ghost.ma`.
- [ ] Staging banner shows on staging, **not** on production.
- [ ] `robots.txt` returns `Disallow: /` on staging/preview and `Allow: /` on production.
- [ ] GA loads only on production (view source: no gtag on staging).
- [ ] `NEXT_PUBLIC_SITE_URL` set per environment (no silent prod fallback on staging).

## 2. Database & migrations
- [ ] Staging uses its own Neon branch; production `DATABASE_URL` is not shared with any other env.
- [ ] Pending migrations reviewed; `npm run prod:status` clean or expected.
- [ ] Multi-step/data migrations follow a runbook (not a blind `migrate deploy`).
- [ ] No `prisma db push` / data reset against production.
- [ ] Backup/checkpoint noted before a schema change.

## 3. Storefront
- [ ] Homepage: value prop, delivery, payments, trust, browse, help all clear within ~15s.
- [ ] No fabricated reviews/ratings shown as real.
- [ ] Empty/loading/error states behave on home, catalogue, product, search.
- [ ] Navbar, footer, floating support/feedback render and self-hide on `/admin`.

## 4. Search & catalogue
- [ ] Alias searches resolve (PSN, PS5, Steam Wallet, Google Play, Netflix, Xbox, Game Pass).
- [ ] Exact product intent ranks above broad category matches.
- [ ] No-result page shows suggestions + support/feedback CTA.
- [ ] `/search` is `noindex`.

## 5. Product pages
- [ ] Region + denomination selectors work; price and DH currency correct.
- [ ] Accepted payment methods reflect live admin config.
- [ ] Delivery expectations honest (no "instant"/"guaranteed" unless true).
- [ ] Compatibility/region info visible.
- [ ] (After SEO fix) per-product metadata + Product JSON-LD, no fake ratings.

## 6. Cart & checkout
- [ ] Totals computed server-side; client cannot alter price/discount/credit.
- [ ] Promo (%/fixed) and Ghost Credit apply and re-validate on order creation.
- [ ] Mixed eligible/ineligible cart behaves.
- [ ] Order snapshot immutable after creation.

## 7. Payments
- [ ] Only admin-enabled methods appear (home, product, cart, payment, footer).
- [ ] Manual/bank/USDT: proof upload, admin review, no double-confirmation.
- [ ] PayPal: correct env, signature verified, duplicate webhook idempotent, amount+currency validated.
- [ ] **Order actions enforce ownership/token (IDOR fixed).**
- [ ] Disabling a method in admin removes it everywhere.

## 8. Ghost Credit & promo codes
- [ ] Double-spend protected; locked credit linked to the exact order.
- [ ] Unpaid-order cancel/expiry releases credit + promo reservation.
- [ ] Milestone/promo rewards grant idempotently; admin grants don't reset expiry.

## 9. Orders & fulfilment
- [ ] A paid, undelivered order can never fall out of the admin queue.
- [ ] Delivery only after confirmed payment and successful provider response.
- [ ] Reloadly: correct env, idempotent purchase, manual fallback.
- [ ] No status regression of delivered/refunded orders.

## 10. Emails
- [ ] Staging never mails real customers (allowlist only).
- [ ] Branded template, DH, correct order number/links, absolute prod asset URLs.
- [ ] No code/secret leakage; delivery is link-only.

## 11. Customer account
- [ ] Orders, wallet (+ locked credit by order), wishlist, support scoped to the session user (no IDOR).

## 12. Support & feedback
- [ ] Public support lookup requires reference + email.
- [ ] Feedback rate-limited; admin triage works.

## 13. Admin operations
- [ ] Dashboard surfaces action queues (payments, fulfilment, support, failed emails).
- [ ] No decorative no-op controls.
- [ ] Money/account actions require confirm + reason + write audit log.
- [ ] All admin actions re-check `requireAdminCustomer` (not just the layout).

## 14. Mobile (320/360/375/390/430/tablet/desktop)
- [ ] No horizontal scroll without relying on global `overflow-x:hidden`.
- [ ] Selectors, cart, checkout, payment, account nav, sheets usable; touch targets ≥44px.
- [ ] Safe-area insets + `100dvh` respected.

## 15. Security
- [ ] Rate limiting on login/register/reset/verify/proof upload.
- [ ] Uploads validate MIME (magic bytes), extension, size; private storage.
- [ ] No secret in `NEXT_PUBLIC_`, responses, logs, or source maps.
- [ ] Webhooks: signature + idempotency + amount/currency.

## 16. Analytics
- [ ] Funnel events fire (view_item → add_to_cart → begin_checkout → purchase).
- [ ] No PII/codes/secrets in events; MAD as currency; no duplicate `purchase`.

## 17. SEO
- [ ] Sitemap lists only public, published, active URLs.
- [ ] Canonicals, OG/Twitter set; account/checkout/admin/search excluded.
- [ ] No fake `aggregateRating` in JSON-LD.

## 18. Performance
- [ ] No oversized images at small sizes; below-fold lazy-loaded.
- [ ] No N+1 on key admin/customer pages; sensitive routes not cached.

## 19. Monitoring
- [ ] Error monitoring active (server actions, webhook, cron, email).
- [ ] High-severity ops issues reach the private Discord alert flow.

## 20. Rollback
- [ ] Vercel rollback + git revert procedure known (see release-process.md).
- [ ] Checkout-disable / maintenance mode verified.
- [ ] Migration reversibility understood (forward-fix strategy documented).
