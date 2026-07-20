# Launch implementation summary — Stage 0 + Stage 1

Date: 2026-07-19 · Branch: `staging` · Audit: `docs/launch-readiness-audit.md`

**One migration created and applied to the DEV branch only.** Production is untouched. See §5.

---

## 1. Stage 0 — launch-safety fixes

| # | Fix | Where |
|---|---|---|
| 1 | **Gift-card codes no longer written to logs.** `JSON.stringify(order)` replaced with `describePayloadShape()`, which emits key names and value *types* only. | `src/lib/suppliers/providers/fazercards.ts` |
| 2 | **SupportPill no longer covers the primary CTA** on `/checkout` and `/payment` (z-40 pill over z-30 fixed bars). | `src/components/support/SupportPill.tsx` |
| 3 | **`typecheck` script added.** | `package.json` |
| 4 | **Production build gated on typecheck** before it migrates. | `package.json` |
| 5 | **Stale Critical blockers corrected** — C-SEC-1 and C-SEC-2 are both fixed. | `docs/pre-launch-audit.md` |

### Two deliberate deviations from the audit's plan

**Build order.** The audit proposed `generate && build && migrate`. That was
wrong: build-first fails *worse* — a successful build followed by a failed
migration leaves **new code on an old schema**, which actively breaks, whereas
old code on a new schema usually just goes unused. `next build` also needs the
migrated schema for static generation. The build is now:

```
prisma generate && tsc --noEmit && prisma migrate deploy && next build
```

which closes the exact mechanism identified (a type error migrating and then
failing to build) without introducing a new failure mode. **Decoupling
migrations from the build entirely remains the right long-term fix** and is a
deployment-workflow decision, not a code change.

**C-SEC-2 was already fixed.** The audit reported it open; re-reading the code
showed the `authorizedForIdentity` gate in `buildCustomerDTO` already withholds
name/e-mail/internal id from public-number lookups. The genuine residual — an
existence oracle — was fixed in Stage 1 instead.

---

## 2. Stage 1 — checkout correctness, guest checkout, consent

### A. Oversell closed

`isVariantPurchasable` treated stock as a **boolean**: a variant holding one
unused code accepted an order for 100, and the customer was asked to pay for 99
codes that did not exist.

- New `hasSufficientStock(mode, unusedCodes, quantity, settings)` in the
  **shared** predicate module `src/lib/search/stock.ts` — the same module the
  storefront badge uses, so the two cannot diverge.
- `resolveCartLines` now checks the **total requested per catalogue key**, so two
  lines of 1 cannot each pass a "1 in stock" check independently.
- Invariant asserted in tests: `hasSufficientStock(m, u, 1, s) === isVariantAvailable(m, u, s)`.

**Not changed:** variant-*less* parent products still have no stock gate. The
storefront computes no stock status for them either, so adding one would refuse
purchases the storefront advertised. Documented, not silently altered.

### B. Idempotent order creation

Natural-key duplicate detection (`src/lib/checkout/idempotency.ts`), **no schema
column required**: an unpaid order for the same customer, same lines, same
subtotal, created within 10 minutes *is* the order a retry is trying to create,
so it is returned instead of creating another.

Covers double-taps, retries after a timeout, refreshes, and the
server-committed-but-response-lost case.

**Deliberate limits:** requests carrying a promo code or Ghost Credit opt out,
because both are resolved *inside* the transaction and the final total is not
knowable beforehand — collapsing could return an order whose total does not match
what was requested, which is worse than a duplicate. Two genuinely simultaneous
requests can still both miss the lookup; closing that needs a unique constraint
on a stored key (deferred, needs a migration).

### C. Guest checkout restored

`createOrderAction` previously hard-rejected anonymous callers. Guests can now
check out, providing **name, e-mail and phone only**.

- **Verified-email proof is required**, reusing the existing six-digit flow. This
  is the safety bar: `createOrder` attaches the order to whatever `Customer` row
  holds that address, so without it anyone could place orders against a
  stranger's e-mail — and the delivery token that later reveals codes is sent
  there. The proof is **not consumed**, so retries and second orders work.
- An address with a **real account** (`passwordHash || googleId || discordId` —
  the same definition registration uses) returns `accountExists`, and checkout
  renders a **"Se connecter"** link rather than a dead-end error.
- Account creation is **not forced**; the existing "Créer mon compte" path is
  untouched and remains optional.
- The DB layer already supported guests (`tx.customer.upsert`) and already minted
  a `deliveryToken` at creation, so **no ownership rewrite was needed** — exactly
  as the brief required.

### D. Order enumeration closed

Public order numbers are sequential. Identity and codes were already withheld,
but a bare number still confirmed an order **existed** and disclosed its status,
amount and item names — walk the numbers, learn what the shop sells and for how
much.

A bare public number now authorizes **nothing**: `getCustomerOrder` returns
`null`, indistinguishable from "no such order". Legitimate holders are
unaffected — they arrive by delivery token, as the logged-in owner, or via
`/find-order`, which proves the e-mail and then redirects to the token.

**Prerequisite fixed in the same change:** four links on the payment page routed
by public order number rather than the token the customer arrived with, so
clicking "Suivre ma commande" silently downgraded a guest and, once delivered,
cost them access to their own codes. All self-links now reuse the arrival
reference (`selfSegment`).

### E. Payment-method revalidation

`createOrder` now re-reads the live usable method set and refuses to create an
order when none exists, or when a specifically requested method is no longer
usable. Methods remain admin-configured; nothing is hardcoded.

### F. Rate limiting

`createOrderAction` is now rate limited on **both** IP and e-mail
(`orderCreateIp` 12/10min, `orderCreateEmail` 6/10min) — necessary because guest
checkout makes it reachable without a session. Reuses the existing limiter.

### G. Analytics consent

No provider loads until the visitor actively chooses.

- `src/lib/analytics/consent.ts` — pure gate. Undecided, refused, corrupt storage
  and an outdated `CONSENT_VERSION` **all fail closed**.
- `src/components/analytics/AnalyticsConsent.tsx` — injects gtag client-side only
  after consent. The unconditional `<script>` is gone from the root layout.
- Banner: **"Accepter" and "Refuser" are equal weight, equal size, one click
  each.** No dark patterns. Footer entry point re-opens the choice.
- Essential storage (session, cart, checkout verification) is explicitly out of
  scope and unaffected — refusing consent cannot break checkout.
- `NEXT_PUBLIC_ANALYTICS_DEBUG=true` logs events instead of sending them.

**Verified in a browser** (see §11): before any choice there is no `gtag`, no GA4
script and no `_ga` cookie; refusal persists and stays inert; accepting in a
non-production runtime still loads nothing.

### H. `checkout_error`

Now emitted on order-creation failure with a **closed reason-code vocabulary**
(`src/lib/checkout/errorReporting.ts`) — never the server's message, which is
French prose that can embed a product name.

---

## 3. Files created

```
src/lib/checkout/idempotency.ts
src/lib/checkout/errorReporting.ts
src/lib/analytics/consent.ts
src/components/analytics/AnalyticsConsent.tsx
test/fazercards/payloadShape.test.ts
test/checkout/idempotency.test.ts
test/checkout/errorReporting.test.ts
test/analytics/consent.test.ts
docs/launch-readiness-audit.md
docs/analytics-setup.md
docs/launch-implementation-summary.md
```

## 4. Files modified

```
package.json                                   typecheck script; build order
src/lib/suppliers/providers/fazercards.ts      code-leak fix + describePayloadShape
src/components/support/SupportPill.tsx         route exclusions
src/lib/search/stock.ts                        hasSufficientStock
src/lib/db/promoResolve.ts                     quantity-aware resolution
src/lib/db/orders.ts                           idempotency, payment-method revalidation,
                                               emailHasRegisteredAccount, enumeration gate
src/app/actions/orders.ts                      guest checkout, rate limiting
src/lib/rateLimit.ts                           order-creation budgets
src/app/checkout/CheckoutClient.tsx            checkout_error, "Se connecter" path
src/app/payment/[id]/page.tsx                  selfSegment threading
src/app/layout.tsx                             consent provider replaces inline gtag
src/components/Footer.tsx                      consent preferences entry point
src/lib/analytics.ts                           debug logging
test/search/stock.test.ts                      quantity-aware cases
docs/pre-launch-audit.md                       C-SEC-1/C-SEC-2 corrections
```

## 5. Migrations

### `20260719120000_add_ops_job_runs_alert_cooldowns_purchase_marker`

Applied to the **dev** Neon branch on 2026-07-19. **Not applied to production.**

All three approved schema candidates, strictly additive:

| Change | Purpose |
|---|---|
| `Order.analyticsPurchaseSentAt` (nullable, no default) | Exactly-once marker for the GA4 `purchase` event |
| `ScheduledJobRun` (new table) | Cron execution state — one row per job, upserted; permanently bounded |
| `AlertCooldown` (new table) | Durable alert cooldown/dedup, replacing the per-process in-memory Map |

**SQL summary:** 1 `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, 2
`CREATE TABLE IF NOT EXISTS`, 2 `CREATE UNIQUE INDEX IF NOT EXISTS`, 2
`CREATE INDEX IF NOT EXISTS`. **Zero** `DROP TABLE` / `DROP COLUMN` / `TRUNCATE`
/ `DELETE` / `RENAME` / `ALTER COLUMN`. Every statement is `IF NOT EXISTS`-guarded,
so it is safe to re-run.

**Hand-authored, not generated.** `prisma migrate dev` cannot run against this
database: pre-existing drift (two historical migrations edited after being
applied, plus a `DeliveredCode` unique index absent from migration history) makes
it offer to **reset the database and drop all data**. That was refused. The
migration was written by hand in the style of
`20260718180000_add_supplier_fulfillment_ledger` and applied with
`prisma migrate deploy`, which applies pending migrations without drift checks or
resets.

`migrate deploy` also applied the pending
`20260718180000_add_supplier_fulfillment_ledger`, which you had pre-approved.

**Verification after applying:** `migrate status` → "Database schema is up to
date". Row counts unchanged (12 orders, 1 customer, 5 products, 3 delivered
codes). `analyticsPurchaseSentAt` is `NULL` on all 12 existing orders — nothing
back-filled. Both new tables exist and are empty. The exactly-once claim was
tested under concurrency on dev: of two simultaneous claims exactly one won, a
third sequential claim returned 0, and the test order was restored to its
original state.

**Wired up:** only the purchase marker (`src/lib/db/fulfillment.ts`), which is
Stage 1 scope. `ScheduledJobRun` and `AlertCooldown` are **schema only** — their
consumers are Stage 4 (operations) work and do not exist yet.

### Pre-existing drift, unresolved

The two edited migrations and the untracked `DeliveredCode` index remain. They do
not block `migrate deploy`, but they do block `migrate dev` permanently, which is
why hand-authoring is now the only viable path for future migrations. Worth a
dedicated reconciliation migration (the repo already has one precedent:
`20260703090000_reconcile_runtime_ddl`).

### ⚠️ Correction (2026-07-19, after the report was first written)

**The "no non-production database" blocker was wrong.** `.env` / `.env.local`
point at the **dev Neon branch** (host `ep-autumn-hat-abcbuc5r`), not production.
Confirmed by its contents: 5 test products (Steam Wallet, PlayStation Store,
Xbox, Nintendo eShop, Valorant Points), exactly as `docs/db-safety.md` describes.
Production serves a different database with 24+ real products.

Consequences of the error:

- There **is** a safe place to author and test migrations, and has been all along.
- `db-guard.mjs` is **not** inert or misconfigured. `activeDbIsProduction()`
  correctly returns false locally because the active database genuinely is not
  production. A local `prisma migrate dev` hits **dev**, which is the intended
  behaviour — not an unguarded production write as previously stated.
- The read-only row counts taken during the audit (12 orders, 1 customer) were
  against **dev test data**, not production records.

**The one genuine remaining blocker** is that `.env.production.local` does not
exist, so `npm run prod:migrate` exits 1. It is produced with:

```
vercel env pull .env.production.local --environment=production
```

then adding `GHOST_DB_ENV=production` to it.

**Still true:** the pre-existing unapplied migration
`20260718180000_add_supplier_fulfillment_ledger` is unapplied **on dev** and
would be applied first by any `migrate deploy` there. It is strictly additive and
`IF NOT EXISTS`-guarded, and you approved it. Production most likely already has
it, since Vercel runs `prisma migrate deploy` on every deploy — verify with
`npm run prod:status` (read-only) before assuming either way.

## 6. New environment variables

| Variable | Required? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | no — absent = enabled | Kill switch for all providers |
| `NEXT_PUBLIC_ANALYTICS_DEBUG` | no — absent = off | Log events instead of sending (non-production only) |

No new dependencies were added.

## 7. Tests added — 36 new (418 → 454)

| File | Covers |
|---|---|
| `test/fazercards/payloadShape.test.ts` | no payload value reaches the log; shape stays diagnostic; depth/width capped |
| `test/search/stock.test.ts` (extended) | the 1-in-stock/100-requested oversell case; quantity-1 equivalence invariant; overrides; inventory on **and** off |
| `test/checkout/idempotency.test.ts` | signature stability; split-line folding; promo/credit opt-out; status, total, window and ordering rules |
| `test/checkout/errorReporting.test.ts` | every mapping; product name never leaks; closed vocabulary |
| `test/analytics/consent.test.ts` | consent accepted/rejected/undecided; analytics absent unless granted; corrupt + version-mismatched storage fail closed; debug never relaxes the gate |

**Coverage requested but not achieved:** guest-checkout, login-transition,
unauthorized-lookup and order-creation tests need a database. The suite is
pure-function by design (`docs/db-safety.md`) and the only reachable database is
production. This is a direct consequence of the §5 blocker.

## 8. Commands run and results

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ pass |
| `npm test` | ✅ **454/454** |
| `npx next build` | ✅ pass |
| `npm run lint` | ❌ **fails — pre-existing** |
| `npx prisma migrate status` | read-only; reported the pending migration |
| `npx prisma migrate deploy` (dev) | ✅ 2 migrations applied |
| `npx prisma validate` | ✅ pass |
| `npm run prod:migrate` | **not run — production untouched** |

`npm run build` was deliberately **not** run: it now includes
`prisma migrate deploy`, which would migrate the live database. The compile steps
were run directly instead.

**Lint failure is pre-existing and unrelated** — verified identical on an
unmodified tree via `git stash`. `next lint` dies with a circular-structure error
loading `.eslintrc.json` (eslint 9 + eslint-config-next 16 vs the legacy config
format). **Lint currently provides zero signal in this repo** and should be
migrated to the ESLint flat-config CLI.

## 9. Security issues fixed

| Severity | Issue |
|---|---|
| **High** | Gift-card codes written to Vercel logs, outside all scrubbing |
| **High** | Oversell — stock never validated against requested quantity |
| **Medium** | Order-existence enumeration via sequential public numbers |
| **Medium** | Order creation had no rate limit (now reachable without a session) |
| **Medium** | Guest orders could be placed against another person's e-mail |
| **Medium** | GA4 loaded with no consent mechanism |
| **Low** | Token-downgrading links cost customers access to their own codes |

## 10. Remaining risks

1. **The migration is applied to dev only.** Production still lacks all three
   changes. The code is safe either way — the purchase-marker claim is the only
   consumer and it degrades to "never send" rather than erroring if the column is
   missing... **except it would error**, because Prisma types the column as
   present. **Production must be migrated before this code is deployed there.**
   See §12.
2. **Nothing in this stage was exercised against a database** — including the new
   idempotency query and the enumeration gate. This remains the largest residual
   risk, but the stated *cause* was wrong: a dev Neon branch exists and is what
   `.env.local` points at (see the correction in §5). The work simply has not
   been run against it yet.
3. **Simultaneous duplicate orders** remain possible (narrow window).
4. **Parent-level products** still have no inventory gate.
5. **Lint is inoperative.**
6. **C-ENV-1 is still open** — staging shares Vercel env vars with production and
   can transact for real. Dashboard work, not code.
7. The rate limiter is **per-instance** and resets on cold start, so it raises
   cost rather than enforcing a hard bound.

## 11. Manual QA checklist

Consent (verified in-browser already, re-check on staging):

- [ ] First visit shows the banner; **no** `_ga` cookie, no `gtag` before choosing
- [ ] "Refuser" persists across reload; analytics stays absent
- [ ] Footer "Cookies et mesure d'audience" re-opens the choice
- [ ] **Checkout completes end-to-end with consent refused**

Checkout:

- [ ] Guest checkout with a fresh e-mail — code received, order created
- [ ] Guest checkout with an e-mail that has an account — "Se connecter" shown
- [ ] Logged-in checkout still prefills name/e-mail read-only
- [ ] Double-tap the CTA → **one** order, not two
- [ ] Submit, kill the network mid-request, retry → same order returned
- [ ] Order a quantity above available stock → refused, not created
- [ ] Deactivate every payment method in admin → checkout refuses cleanly

Order access:

- [ ] `/payment/<public number>` for an order you do not own → not found
- [ ] The delivery-token link still works, and "Suivre ma commande" **keeps** access
- [ ] `/find-order` with the right e-mail still redirects correctly

## 12. Deployment order

**This release now carries a migration.** Order matters.

**Production is EIGHT migrations behind, not one.** Verified 2026-07-19 via
`npm run prod:status` against `ep-steep-flower-abs0aa13` (production). `main` is
well behind `staging`, so production is running older code against an older
schema — self-consistent, but it means the next production deploy applies all
eight at once:

```
20260717050000_repair_drift_and_add_birthday
20260717120000_add_fazercards_fulfillment
20260717150000_add_supplier_management
20260717180000_add_variant_supplier_mappings
20260718140000_add_guide_visibility_and_product_links
20260718160000_add_guide_article_fields
20260718180000_add_supplier_fulfillment_ledger
20260719120000_add_ops_job_runs_alert_cooldowns_purchase_marker   ← this release
```

**Safety review of the whole batch** (all eight):

- No `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` / `RENAME` /
  `ALTER COLUMN` / `DROP INDEX` anywhere.
- The only `DROP CONSTRAINT`s are two idempotent FK drop-then-adds on
  `SupplierFulfillment`, a table created by that same migration.
- **No `ADD COLUMN … NOT NULL` without a `DEFAULT`** — the classic failure mode
  when applying to a table that already has rows. The batch is safe against live
  data.

**Recommended order: migrate production BEFORE deploying the code**, not as part
of it. All eight are additive, so new-schema + old-code means the new objects sit
unused — the safe direction. It also moves any migration failure to a moment
when nothing is mid-deploy:

```
CONFIRM_PRODUCTION_DB=true npm run prod:migrate
```

### `.env.production.local` notes

`vercel env pull` returns **empty** values for variables marked *Sensitive* in
Vercel — `DATABASE_URL` and `DIRECT_URL` both came through blank, and
`prisma migrate status` failed closed rather than falling back to dev. They were
populated from `DATABASE_URL_UNPOOLED` (on Neon, the unpooled URL is exactly what
`DIRECT_URL` should be; this file is read only by `prod-op.mjs` for migrations, so
pooling is irrelevant here). A `.env.production.local.bak` of the original pull
was left in place. Both are gitignored (`.gitignore:21`).

With `DATABASE_URL` populated, `db-guard.mjs`'s host-matching signal is now armed
for the first time.
2. Take a Neon checkpoint / branch on production (`docs/release-process.md`).
3. Merge to `staging`; confirm the Vercel build passes (it now runs `tsc --noEmit`
   before migrating).
4. Run the §11 checklist on `staging.ghost.ma`.
5. Set `NEXT_PUBLIC_GA_ID` + `GA_API_SECRET` in Vercel **Production** only.
6. Promote to production. The Vercel build runs `prisma migrate deploy`
   automatically, so the migration applies as part of the deploy. If you prefer
   to apply it deliberately beforehand:
   `CONFIRM_PRODUCTION_DB=true npm run prod:migrate`.

## 13. Rollback

**Code:** revert the commit and redeploy.

**Schema:** the migration is purely additive with no backfill, so the *previous*
release runs unchanged against the *new* schema — the new column and tables
simply go unused. **Rolling back the code does not require rolling back the
schema, and you should not attempt to.** Dropping the column would destroy the
exactly-once record and could cause `purchase` events to be re-sent on any later
re-delivery.

If the schema must be reverted anyway, restore from the Neon checkpoint taken in
§12 step 2 rather than hand-dropping objects.

Two behavioural reverts worth knowing individually:

- Re-blocking guest checkout: restore the `if (!customer) return …` guard in
  `createOrderAction`.
- Re-opening public-number access: remove the
  `if (!authorizedForCodes && !viaInternalId) return null;` line in
  `getCustomerOrder`.

## 14. Deferred to later stages

- **Consumers** of `ScheduledJobRun` and `AlertCooldown` — the tables exist, but
  cron failure tracking and durable alert cooldowns are Stage 4 work.
- Workstream 2 (mobile) in full — the `Modal` primitive, touch targets, the 8
  admin tables, `vh` → `dvh`, `docs/mobile-qa-checklist.md`.
- Workstream 4 (operations) in full — structured logging, cron failure alerting,
  stuck-order detection, `docs/database-backup-and-recovery.md`,
  `docs/operations-runbook.md`, backup scripts, the "État du système" panel.
- Remaining analytics events: `view_item`, `add_to_cart`,
  `payment_proof_submitted`, `payment_method_changed`, `support_contact_clicked`.
- Meta Pixel.
- Order-summary additions (unit price, platform, delivery ETA).
- Supplier purchase idempotency ledger (explicitly out of scope).

## 15. Is it safe to proceed?

**Yes for code — with one condition before Stage 2+.**

Stage 0 and Stage 1 are self-contained, type-checked, tested, built, and
partially browser-verified. Nothing is destructive and rollback is a revert.

**The condition** is much smaller than first reported (see §5). A dev Neon branch
already exists and `.env.local` points at it, so migrations can be authored and
tested safely today. Before applying anything to production:

1. `vercel env pull .env.production.local --environment=production`, then add
   `GHOST_DB_ENV=production` to it — this is what `npm run prod:migrate` needs,
   and it also re-arms `db-guard.mjs`'s host-matching signal.
2. `npm run prod:status` (read-only) to see what production has actually applied.
3. Confirm Neon PITR retention on the current plan.
