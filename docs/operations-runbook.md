# Operations runbook

What to do when something breaks. Each entry: how you find out, how to confirm,
what to do, and what *not* to do.

**First, always:** if customers are being harmed (paying and receiving nothing,
or being charged wrongly), turn the **ordering kill switch OFF** in
`/admin` before diagnosing. It stops new orders entering a broken system and
costs nothing to reverse.

**Where to look:** `/admin/operations` (health chips, warnings, jobs, recent
orders) · Discord `#system-alerts` · Vercel logs · Sentry (once a DSN is set).

---

## 1. Website unavailable

**Signal:** uptime monitor, or `GET /api/health` not returning 200.

1. `curl -i https://www.ghost.ma/api/health` — 503 means the app is up but the
   database is not; no response at all means the deployment or DNS is down.
2. Vercel dashboard → Deployments. Is the latest one `Error`?
3. If a recent deploy broke it, **roll back in Vercel** (Promote a previous
   deployment). Do not try to fix forward under pressure.
4. If the deploy is fine, check Neon status — see §2.

**Do not** redeploy repeatedly hoping it clears. If the build is failing, read
the build log; the build now runs `tsc --noEmit` before migrating, so a type
error stops it before the schema moves.

## 2. Database unavailable

**Signal:** `/api/health` returns 503 · `database` chip offline · Discord alert.

1. Neon console → is the project suspended, over quota, or mid-incident?
2. Neon free/entry tiers **auto-suspend when idle**; the first request after that
   pays a cold-start delay. Intermittent slow first-requests are usually this,
   not an outage.
3. Confirm `DATABASE_URL` and `DIRECT_URL` are still set in Vercel → Production.
   Note they are marked *Sensitive*, so `vercel env pull` returns them **empty** —
   an empty value looks identical to a missing one in a pulled file.
4. If the database is healthy but the app cannot reach it, redeploy to force new
   connections.

**Do not** run migrations while diagnosing.

## 3. Payment proof upload failing

**Signal:** customer reports it, or `payment_submitted` counts flatline.

Proofs are **base64 columns in Postgres**, not object storage — so an upload
failure is a database or a size problem, never a bucket problem.

1. Limits: 5 MB, `png/jpg/jpeg/pdf`. A phone photo can exceed 5 MB — ask the
   customer to screenshot rather than photograph.
2. Check the database is accepting writes (§2).
3. Confirm ordering is enabled — the proof flow is gated by the same kill switch.
4. **Workaround:** the customer can send the proof via support, and an admin can
   confirm the payment manually from `/admin/orders/<id>`. The proof is evidence,
   not a mechanism.

## 4. Email delivery failing

**Signal:** Discord `#system-alerts` "Failed to send … email" · `email` chip
warning · `EmailLog` rows with `status = failed`.

1. Resend dashboard: quota, domain verification, suppression list.
2. `RESEND_API_KEY` present in Vercel → Production?
3. `ENABLE_REAL_EMAILS` must be `true` in production. If it is unset, sends are
   *simulated* and log as such — the system looks healthy while no customer
   receives anything.
4. **There is no retry queue.** A failed email is dead. Re-send by re-triggering
   the action (e.g. re-confirm the payment) or contact the customer directly.

The alert is now deduplicated per template (15 min), so an outage produces one
message per template rather than one per attempt. The recipient address is
**masked** in the alert — look the order up by its reference.

## 5. Supplier API unavailable

**Signal:** Discord `supplier:*` alerts · supplier card offline · failed
fulfilments.

1. `/admin` → Suppliers → *Tester la connexion* for a live probe.
2. Check the provider's status page and whether the subscription lapsed
   (`subscriptionActive` on the supplier card).
3. **Disable the supplier** in admin rather than letting orders fail repeatedly.
   Orders stay in `payment_confirmed` and can be fulfilled manually or once the
   provider recovers.
4. For orders stuck mid-purchase, check `SupplierFulfillment` — the
   `idempotencyKey` unique index means a retry cannot double-buy.

**Do not** retry a purchase by hand without checking the ledger first: the point
of that table is that the database, not your judgement, prevents a double spend.

## 6. Supplier balance too low

**Signal:** Discord `balance_low` / `balance_critical` · supplier card.

1. Top up in the provider dashboard.
2. Thresholds are per-supplier (`warningBalance` / `criticalBalance`), defaulting
   to 50 / 10.
3. Cooldowns: critical 60 min, low 6 h — now **durable**, so they survive a cold
   start instead of re-alerting on every one.

Note a real gap: a *failing* balance read is swallowed, so the dashboard may show
a stale balance rather than an error. If a balance looks frozen, test the
connection explicitly.

## 7. Orders stuck

**Signal:** Discord `orders:*` alert (hourly `stuck-orders` cron) ·
`/admin/operations` warnings.

Thresholds — configurable via env, defaults:

| Status | Default | Meaning |
|---|---|---|
| `payment_submitted` | 12 h | Proof awaiting admin review |
| `payment_confirmed` | **2 h** | **Paid, nothing delivered — worst case** |
| `payment_issue` | 24 h | Flagged and forgotten |

1. Open the order from the alert link (it carries the public reference and an
   admin URL).
2. `payment_confirmed` and undelivered → deliver it, manually if the supplier is
   down. The customer has paid.
3. `payment_submitted` → review the proof and confirm or reject.

**The cron alerts only. It never cancels, refunds or advances an order** — there
are no safe automatic transition rules, and a timer touching real money is how
you turn an incident into a bigger one.

## 8. Customer paid but the order did not update

1. Find the order via `/admin` (search by the public reference the customer
   quotes, or their email).
2. Bank transfer / crypto are **manual**: nothing updates until an admin reviews
   the proof. This is expected, not a bug.
3. PayPal is automated — if it did not update, check `PaymentWebhookEvent` for
   the event and `paymentProviderStatus` on the order.
4. Confirm manually from the order page once you have verified receipt.

**Never** confirm a payment on the customer's word alone. Verify against the bank
or provider first.

## 9. Duplicate order

Checkout collapses an identical unpaid basket from the same customer within 10
minutes, so most duplicates no longer reach the database. Genuine duplicates can
still occur — two simultaneous requests, or a repeat with a promo/credit applied,
which deliberately opts out of collapsing.

1. Confirm they really are duplicates (same items, same customer, minutes apart,
   both `pending_payment`).
2. Cancel the extra from `/admin/orders/<id>`.
3. If **both** were paid, refund one and record why in the order note.

**Do not** delete order rows. Cancel them — the audit trail is the record.

## 10. Incorrect price

Prices are re-read from the database at order creation; the client total is never
trusted. So a wrong price means the **catalogue** is wrong, not the checkout.

1. Fix the product/variant price in admin. Existing orders keep the price they
   were created with — deliberately, as that is what the customer agreed to.
2. If an order was created at a wrong price: honour it if small, or contact the
   customer and cancel/refund. Do not silently edit the order.

## 11. Delivered code dispute

1. `/admin/orders/<id>` shows exactly which code was delivered and when.
2. `PaymentEvent` gives the full lifecycle timeline.
3. If the code was already redeemed elsewhere, check the supplier dashboard —
   for supplier-fulfilled orders they hold the authoritative redemption record.
4. Issue a replacement by assigning a new code; the original stays on the record.

**Codes are never in logs, emails or analytics by design.** If you cannot find a
code outside the admin UI, that is the system working.

## 12. Analytics not recording

1. `NEXT_PUBLIC_GA_ID` set in Vercel → **Production**? There is no fallback.
2. **Analytics only loads after the visitor accepts consent.** Undecided and
   refused both mean no `gtag`, no cookie, no events. Expect GA4 to under-report
   sessions by whatever share declines.
3. Staging never sends — `isProductionRuntime()` gates it, deliberately.
4. `purchase` is **server-side** and fires on `delivered`, not on payment. An
   order confirmed but never delivered sends nothing.
5. `purchase` is sent at most once per order (`Order.analyticsPurchaseSentAt`).
   To deliberately re-send, clear that column for the affected orders.

Local debugging: `NEXT_PUBLIC_ANALYTICS_DEBUG=true` logs every event instead of
sending it. See `docs/analytics-setup.md`.

## 13. Discord alerts not arriving

1. `DISCORD_INTEGRATION_ENABLED=true`, plus `DISCORD_BOT_TOKEN` and
   `DISCORD_GUILD_ID`? The gate **fails closed** — any one missing means silence.
2. Channel IDs set (`DISCORD_CHANNEL_SYSTEM_ALERTS_ID` etc.)?
3. Is the bot still in the guild with permission to post?
4. **Check the cooldown before assuming breakage.** Alerts are now durable and
   deduplicated — a repeat inside the window is suppressed by design. The
   `AlertCooldown` table shows `lastFiredAt` and `suppressedCount`; a rising
   `suppressedCount` means the alert is firing and being muted, not missing.

## 14. Scheduled job failure

**Signal:** Discord `cron:*` alert after 2 consecutive failures · jobs strip on
`/admin/operations`.

1. The strip now reports **recorded executions**, not "we're on Vercel". A job
   showing "aucune exécution enregistrée" has genuinely never completed.
2. Vercel → Logs, filtered to the cron path, for the real error.
3. Verify `CRON_SECRET` is set. Missing → every invocation returns **503**, by
   design (fails closed rather than opening the endpoint).
4. Re-run manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://www.ghost.ma/api/cron/<job>`

## 15. Rollback

**Code:** Vercel → Deployments → promote the previous one. Fastest path, no
build required.

**Schema:** additive migrations do **not** need rolling back — the previous
release runs fine against the newer schema, with new columns unused. Rolling a
schema back is almost always the wrong move and risks destroying data the newer
code wrote.

If a schema change genuinely must be reverted, use a **Neon branch from before
the migration** (see `docs/database-backup-and-recovery.md` §7) rather than
hand-dropping objects.

**Order of operations for a bad release:** roll back the code first, confirm the
site is healthy, *then* decide about the schema. The two are separable and
usually only the first is needed.

## 16. Escalation and manual recovery

**Severity:**

| Level | Example | Response |
|---|---|---|
| **Critical** | Site down · database down · money taken and nothing delivered | Immediately. Kill switch off, then diagnose. |
| **High** | Supplier down · email down · a cron dead for a day | Same day. |
| **Medium** | Balance low · review backlog · single failed fulfilment | Next working session. |
| **Low** | One-off error in Sentry | Triage during normal work. |

**Manual recovery works for everything.** Every automated path has a human
equivalent: confirm a payment from the order page, assign a code by hand, deliver
without a supplier, email a customer directly. When automation is broken,
**turn ordering off and work the queue manually** rather than leaving customers
waiting on a system that cannot serve them.

**Keep a record.** Note what happened in the order's admin note. The next person
to look at that order — possibly you, months later — will have only what the
record says.
