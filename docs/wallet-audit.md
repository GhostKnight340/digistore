# Ghost Credit Wallet — Security & Accounting Audit

Scope: the Ghost Credit wallet (issuance, spending, refunds, expiry, admin tools,
reconciliation). This documents the architecture, the audit findings and their
fixes, the exact lifecycles, and the concurrency/idempotency strategy.

## Architecture

- **Source of truth:** append-only `GhostCreditTransaction` ledger. Each row is a
  `credit` or `debit` of a strictly positive whole-MAD amount, with a `reason`, a
  `status` (`active` | `reversed` | `expired`), a unique `idempotencyKey`, and
  optional `orderId` / `promoCodeId` / `rewardType` / snapshot fields.
- **Cache:** `Customer.ghostCreditBalanceMad` is a performance cache, updated only
  inside the same transaction as the ledger write, and reconcilable from the
  ledger at any time (`deriveBalance` / `wallet:reconcile`).
- **Money:** integer MAD everywhere — no floating point in any ledger path.
  Percentage credit is rounded once (`roundMad` = `Math.round`) at the reward
  level (`computeGhostCredit`). Display is "DH"; internal currency is MAD.

## Findings & fixes

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Critical** | **Double-spend / negative balance.** `debitCreditTx` read the balance then decremented without a lock. Under Postgres READ COMMITTED, a checkout spend racing an admin reversal (or a spend racing expiry) could both read the full balance and both decrement, driving the balance negative and spending the same credit twice. | Acquire `SELECT … FOR UPDATE` on the customer row before the read, in `debitCreditTx` and `expireWalletIfDue`. This serializes all balance-reducing wallet writes per customer, so the cap always sees committed state. Overspend is now impossible under concurrency. |
| 2 | High | **Idempotency-key race.** `findUnique`-then-`create` could let two concurrent same-key writes both pass the check; the second throwing an unhandled unique violation. | The unique index is the real guard; the create is now wrapped to treat a P2002 as a clean duplicate no-op (grant + debit). |
| 3 | High | **Order total could diverge from the wallet movement** if the debit applied less than the pre-read estimate. | `createOrder` now uses the amount **actually debited** (`debit.appliedMad`) for both `Order.ghostCreditAppliedMad` and the final total. |
| 4 | Medium | **Admin manual grant double-submit** used a random idempotency key, so a double-click could double-grant. | Admin adjust now takes a stable `requestId` → `manual-credit:{requestId}`; a retried submit is idempotent. Amount bounds + integer checks added. |
| 5 | Medium | **Refund of already-spent promo credit** flagged for review but left the wallet usable. | The wallet is now **frozen** (`Customer.walletFrozen`) with a reason when a reversal can't be fully applied; spending is blocked until an admin unfreezes. No negative balance is ever written. |
| 6 | Medium | **No DB-level integrity constraints.** | Migration adds `CHECK (amountMad > 0)` and `CHECK (direction IN ('credit','debit'))`; idempotency stays enforced by the existing `UNIQUE(idempotencyKey)`. |
| 7 | Low | **No reconciliation tooling / structured logs.** | Added `wallet:reconcile` (read-only, opt-in cache repair), an admin read-only reconcile action, and structured `[ghost-credit] …` logs for grant/debit/duplicate/insufficient/expire/reconcile-mismatch/freeze. |

Auth/IDOR were already sound: every wallet/promo read and the spend path derive
`customerId` from the authenticated session (`getCurrentCustomer`); no endpoint
accepts a client `customerId`. Admin actions require `requireAdminCustomer`.

## Lifecycles

**Issuance (promo Ghost Credit):** granted **only** at the successful paid state
(`payment_confirmed`, via `finalizeOrderPromotion`), never when a promo is
entered, an order is created, or PayPal checkout starts. Idempotency key
`promo-credit:{orderId}:{promoCodeId}`.

**Spending:** authenticated only. `createOrder` (inside one transaction that
already holds the customer row lock via the customer upsert/update):
1. expire due credit, 2. read balance (frozen wallet ⇒ 0), 3. `capSpend(requested,
balance, remainingPayable)` — client amount is only an upper bound, 4. debit
(`credit-spend:{orderId}`, one per order), 5. lock the discounted total into
`Order.totalMad` + `ghostCreditAppliedMad`. Full-credit orders (total → 0 DH) are
allowed and follow the normal order lifecycle. Ghost Credit never alters supplier
cost or fulfilment data, and is never counted as external payment revenue
(payment providers verify against `Order.totalMad`, the external payable).

**Refund / cancellation:**
- Cancelled/rejected/unpaid → release promo reservation + re-credit any spent
  credit (`credit-refund:{orderId}`); no promo credit is granted.
- Refunded → reverse granted promo credit proportionally to the refunded eligible
  amount (`computeCreditReversal`) via a new debit; original entries untouched.
  If the credit was already spent → freeze wallet + flag (finding #5).
- Refund of external payment is based on `Order.totalMad` (what was actually paid
  externally), never the undiscounted list price (per-line allocation persisted).

**Expiry:** whole wallet expires after **60 days of inactivity**; every credit
grant resets the deadline, spending does not. Enforced idempotently on read/spend
(`wallet-expire:{customerId}:{deadlineISO}`), so a repeat can't expire twice.

## Concurrency & idempotency strategy

- **Per-customer serialization** of balance-reducing writes via `SELECT … FOR
  UPDATE` on the customer row (finding #1). The order-creation transaction already
  write-locks the customer row (customer upsert/update) before spending, so
  concurrent checkouts for the same customer serialize.
- **Atomic cache updates** via `{ increment/decrement }`.
- **One event = one key**, enforced by `UNIQUE(idempotencyKey)` at the DB (not
  just app checks). Canonical builders live in `src/lib/promo/ledgerMath.ts` and
  are unit-tested, so the tested keys are the live keys.

## Reconciliation

`npm run wallet:reconcile` (read-only) recomputes each wallet from the ledger and
reports drift; `-- --repair` with `WALLET_REPAIR_CONFIRM=1` corrects the **cache**
to match the ledger (never rewrites history). Admin read-only action:
`getWalletReconciliationAction`.

## Deferred / not implemented (with rationale)

- **Full status state machine** (`PENDING`/`RESERVED`/`SETTLED` …). The current
  model debits-on-create (acting as reserve+settle) and re-credits on
  cancel/refund. This is safe and auditable, but does not surface a distinct
  "reserved" or "pending" balance. A pending balance for not-yet-granted promo
  credit is intentionally **not** created as ledger rows (credit only exists once
  granted), which is safer but less granular than the spec's status set.
- **Order-expiry job** to auto-release credit on abandoned unpaid orders. Spent
  credit on an order that is never paid and never cancelled stays debited until
  someone cancels it (locked, not lost). No such cron exists in the project yet.
- **Full admin wallet UI** — BUILT. Per-customer page at
  `/admin/clients/[customerId]/ghost-credit` (linked from the Clients panel):
  summary, filterable/paginated ledger with an idempotency-reference technical
  view, order-locked-credit list (open-only, no arbitrary unlock), read-only
  reconciliation view, and audited admin actions (manual grant/debit, freeze/
  unfreeze) each requiring a reason and previewing the resulting balance before a
  confirmation modal. Backed by the existing server actions
  (`adminAdjustGhostCreditAction`, `adminSetWalletFrozenAction`) plus
  `getAdminWalletDetailAction` / `getAdminWalletLedgerAction`.
- **True concurrency integration tests** — BUILT as a gated Postgres suite
  (`test/integration/wallet-concurrency.test.ts`). It exercises the real wallet
  functions over concurrent connections. It is a no-op unless
  `WALLET_INTEGRATION_TEST_DATABASE_URL` is set and hard-refuses to run against
  `DATABASE_URL`/`PRODUCTION_DATABASE_URL`. Run it with:

  ```sh
  export WALLET_INTEGRATION_TEST_DATABASE_URL='postgresql://…/ghost_staging_test'
  npx prisma migrate deploy      # bring the test DB schema up to date
  npm run test:integration
  ```

  The pure money/ledger math and idempotency keys remain unit-tested
  (`test/promo/wallet.test.ts`, `test/promo/order-expiry.test.ts`).

### Reconciliation fix (whole-wallet expiry)

`expireWalletIfDue` previously wrote its `expiration` debit as `status:"active"`
while flipping the settled credits to `"expired"`, so the ledger-derived balance
came out at `-balance` for every naturally-expired wallet and reconciliation
flagged a false mismatch. The expiration debit is now written `status:"expired"`
so it is excluded from the active-ledger derivation alongside the credits it
settles (both net to 0, matching the zeroed cache). Covered by a pure test in
`test/promo/wallet.test.ts` and by scenario checks in the integration suite.

## Manual penetration / failure test plan

Run against a real database (staging), logged in as a customer with a known
Ghost Credit balance.

1. **Double-click checkout** with credit applied → exactly one `credit-spend:{orderId}` debit; balance reduced once.
2. **Two tabs / two simultaneous checkouts** spending the full balance → one succeeds, the other applies only the remaining (0) — balance never negative.
3. **Refresh during payment** → order already created; balance already debited once; no second debit.
4. **Duplicate PayPal webhook replay** on a promo-credit order → one `promo-credit:{orderId}:{promoCodeId}` grant.
5. **Admin confirmation clicked twice** (manual bank/USDT) → one grant.
6. **Cancel order during payment** → `credit-refund:{orderId}` re-credit once; promo reservation released.
7. **Refund after credit partially spent** → wallet frozen + flagged; no negative balance.
8. **Expired credit during active checkout** → expiry runs on read; can't spend expired credit.
9. **DB/network failure mid-reservation** → whole order transaction rolls back; no orphan debit.
10. **Provider failure after payment** → status stays pre-confirmed; no premature grant.
11. **Large-value admin adjustment** → bounded/rejected above 1e9; reason mandatory; idempotent per requestId.
12. **Malformed API request** (negative/huge/non-integer spend amount) → `capSpend` floors/rejects; server re-caps to balance.
13. **Unauthorized wallet access / IDOR** (call wallet action while logged out or attempt another customer's id) → rejected; id is session-derived, never client-supplied.
14. **Reconciliation** → `npm run wallet:reconcile` reports 0 mismatches on a healthy DB; deliberately corrupt the cache and confirm it's detected and repairable.
