# Ghost Credit — 180-day qualifying expiry + spending milestones

Extends the existing Ghost Credit wallet (ledger, account page, order lifecycle,
promo rewards, settings, cron, email, money utils) — no wallet redesign.

## Part 1 — 180-day inactivity expiry (qualifying-only)

Ghost Credit expires after **180 consecutive days without a QUALIFYING earned
credit**. The inactivity period is configurable in store settings
(`ghostCredit.inactivityDays`, default 180).

**Only these reset the timer** (they carry `resetsExpiration = true` on their
ledger row and set `Customer.lastQualifyingCreditEarnedAt`):
1. Fixed Ghost Credit promo reward granted after a paid+completed order.
2. Percentage Ghost Credit promo reward granted after a paid+completed order.
3. Spending-milestone reward granted after a paid+completed order.

**These never reset the timer** (`resetsExpiration = false`): manual admin
grant/correction, migration/reconciliation adjustment, refund restoration,
promo/milestone reversal, spending, expiration. The reset is set explicitly by
the granting code — **never inferred from amount/direction**.

Model is **wallet-level**: on a qualifying event, `lastQualifyingCreditEarnedAt =
earnedAt` and `ghostCreditExpiresAt = earnedAt + inactivityDays`. The decision
lives in the pure, tested `computeExpiryDecision` (`src/lib/promo/ledgerMath.ts`).

**Manual-grant rule (documented & tested):** a manual grant never resets the
timer and doesn't mark qualifying. If a cycle exists, the deadline is preserved;
if none exists, the grant seeds a default `now + inactivityDays` deadline so
manual credit isn't permanent — without updating `lastQualifyingCreditEarnedAt`.

**Expiration + reminder job** — `/api/cron/ghost-credit` (daily, `runWalletExpiryAndReminders`):
- Expires wallets past their deadline via one `EXPIRATION` debit per cycle
  (idempotent per-deadline key; history preserved).
- Sends the "3 days before" reminder to opted-in customers, once per cycle
  (idempotency anchor `Customer.expirationReminderSentFor == deadline`, claimed
  with a conditional `updateMany` so a duplicate run can't double-send). Skipped
  for zero balance, frozen, or already-expired wallets.
- Reminder email template `ghost_credit_expiry_reminder`; preference toggle on
  the account page (`setExpiryReminderAction`, default off).

## Part 2 — configurable spending milestones

Cumulative account-level thresholds ("spend X total → earn Y Ghost Credit"),
granted **once per customer per milestone**. Not points, not per-order cashback.
Multiple milestones supported. Admin CRUD at **Ghost Credit → Paliers de
dépenses** (`MilestonesPanel`): create/edit/activate/deactivate/duplicate/
archive/reorder, with per-milestone reporting (customers unlocked, reversals,
total granted).

**Qualifying spend** (documented) = Σ over the customer's paid+completed orders
(`payment_confirmed`/`delivered`) of `Order.totalMad + Order.ghostCreditAppliedMad`
— i.e. the value after immediate promo discounts, **including** Ghost Credit
redeemed (a real completed purchase). Refunded/cancelled/rejected/pending orders
are excluded, so a refund reduces it.

**Grant** (`grantMilestonesForCompletedOrder`) runs only when an order reaches
`payment_confirmed`/`delivered`. It grants every newly-crossed live milestone
exactly once (ascending), each as a `spending_milestone_reward` ledger credit
with `resetsExpiration = true`. Idempotent via `SpendingMilestoneGrant` unique
`(milestoneId, customerId)` + ledger key `spending-milestone:{milestoneId}:{customerId}`
— duplicate webhooks / concurrent orders / retries never double-award.

**Reversal on refund** (`reverseMilestonesForOrder`): recomputes qualifying spend,
reverses granted milestones whose threshold now exceeds it **highest-first**, via
a `milestone_reversal` debit (`resetsExpiration = false`) linked to the grant;
never edits history. If the reward was already spent, the wallet is **frozen**
for admin review instead of going negative.

**Versioning:** editing a milestone's threshold/reward when it already has grants
**archives** the old row and creates a new one (new id, version+1), keeping
historical grants linked to the version that produced them. Other edits update in
place.

**Profile UI** (account wallet page): expiration countdown ("Expiration dans N
jours — DATE"), "Votre prochaine récompense" progress (spent/threshold, remaining,
reward, progress bar with text + ARIA), compact milestone track (unlocked /
current / locked), and the reminder toggle. All-unlocked shows "Vous avez
débloqué tous les paliers actuellement disponibles." — no invented repeating
milestone.

## Concurrency & idempotency

- Wallet writes serialize per customer via `SELECT … FOR UPDATE` (from the prior
  audit); milestone grants add a unique `(milestoneId, customerId)` constraint +
  a unique ledger key; P2002 races resolve to a clean no-op.
- Milestone/expiry evaluation runs server-side only; the client never submits
  qualifying spend, progress, milestone id, reward, or balance.

## Reconciliation

`npm run wallet:reconcile` now also runs `reconcileExpiry` — verifies
`ghostCreditExpiresAt == lastQualifyingCreditEarnedAt + inactivityDays` for
wallets with a qualifying event (read-only; reports drift). Ledger-vs-cache
balance check unchanged.

## Analytics

`wallet_expiry_reminder_enabled` / `_disabled` (toggle) and
`milestone_progress_viewed` (account section) via the existing PII-free
`trackEvent`. Server milestone grants are logged (`[ghost-credit] grant.settled`).

## Deferred / notes

- **Reserved credit at expiry:** the spend model debits credit at order creation,
  so the available balance never contains a separate "reserved" amount — expiry
  only touches available balance, and a customer can't dodge expiry by holding an
  order open. If an order using credit is cancelled *after* the wallet already
  expired, the restored credit is re-credited with a fresh default cycle rather
  than immediately re-expired (customer-friendly; documented deviation from the
  strict "immediately expire released credit" rule, which assumes a
  reserve-in-balance model this wallet doesn't use).
- **True concurrency/integration tests** require a Postgres test DB the pure
  `node:test` harness lacks; the DB-level guarantees (unique constraints, row
  locks) are covered by design, and the money/selection logic is unit-tested
  (`test/promo/milestones.test.ts`, `test/promo/wallet.test.ts`).
- **Optional milestone product/category scope** was intentionally not added
  (global milestones prioritized, per the brief).
