# Payment methods migration — production runbook

This PR replaces the fixed `Bank` / `CryptoWallet` / `PaymentMethodConfig`
tables with one generic `PaymentMethod` table. The change ships as **two**
Prisma migrations with a data-backfill script that must run strictly between
them, plus an application deploy that must land at a specific point in the
sequence. Follow this runbook in order — do not skip or reorder steps.

Migration folders (exact names, in `prisma/migrations/`):

1. `20260706100000_add_payment_method` — additive only. Creates the
   `PaymentMethod` table. Does not touch `Bank`, `CryptoWallet`, or
   `PaymentMethodConfig`.
2. `20260706120000_drop_legacy_payment_tables` — destructive. Drops `Bank`,
   `CryptoWallet`, and `PaymentMethodConfig`.

Backfill script: `scripts/backfill-payment-methods.ts`.

## ⚠ Read this before touching production

**`npx prisma migrate deploy` applies every pending migration in one run —
it will NOT stop between migration 1 and migration 2.** If you run a plain
`prisma migrate deploy` against a database that has neither migration
applied yet, it will create `PaymentMethod` *and* immediately drop the
legacy tables in the same invocation, before the backfill script has had a
chance to copy any data. **That is permanent data loss** (every bank
account, crypto wallet, and PayPal/card config, gone, with nothing in the
new table to replace them).

`docs/production-env.md` currently says: *"Run `npx prisma migrate deploy`
during deployment when possible."* That guidance is fine for ordinary
single-migration releases, but it is **not safe to follow blindly for this
release**. Section 1 below shows the alternative: temporarily hide migration
2 from the Prisma CLI so `migrate deploy` only sees and applies migration 1.

**Also check your deployment platform (Vercel project settings, any custom
build command, CI):** if the build/deploy pipeline is configured to run
`prisma migrate deploy` automatically on every push or build (as the docs
above recommend), that automatic run will hit the same "applies everything
pending" problem the moment this branch is merged. Before merging:
- Find where `prisma migrate deploy` actually gets invoked for production
  (Vercel build command override, a deploy hook, a manual step someone
  runs — it is not in this repo's `package.json` or in a checked-in CI
  workflow, so it must be configured somewhere in the hosting platform).
- Temporarily disable or intercept that automatic run for this release, or
  make sure whoever merges/deploys this PR runs the staged sequence below
  manually **instead of** the normal automatic migrate step, for this one
  release only.

## Before you start

- **Take a fresh database backup / snapshot.** If using Neon, create a
  branch or a point-in-time restore checkpoint immediately before step 1.
  Note its timestamp/branch id somewhere the team can find it.
- Confirm `DATABASE_URL` / `DIRECT_URL` in the environment you're running
  these commands from point at the **production** database, not a
  preview/staging one.
- Have this PR's branch checked out and installed (`pnpm install` /
  `npm install`) wherever you run steps 1–3 below, so the Prisma Client and
  `scripts/backfill-payment-methods.ts` match this schema.

All commands below are shown as run from the repo root with `DATABASE_URL`
(and `DIRECT_URL`, if your setup uses one) already exported for production.

---

## Step 1 — Apply migration 1 only (additive)

Prisma's CLI has no "apply up to migration X" flag, so the safe way to apply
only migration 1 is to make migration 2 temporarily invisible to the CLI,
run `migrate deploy` (which will then only find migration 1 pending), and
put migration 2 back immediately after:

```bash
# 1a. Move migration 2 out of prisma/migrations/ so the CLI can't see it.
mv prisma/migrations/20260706120000_drop_legacy_payment_tables /tmp/pending-migration-2

# 1b. Apply whatever is pending — at this point that's only migration 1.
npx prisma migrate deploy

# 1c. Put migration 2's folder back so the repo/working tree is unchanged
#     and `git status` is clean. It is now back on disk but NOT yet applied
#     to the database (migrate deploy already ran in 1b).
mv /tmp/pending-migration-2 prisma/migrations/20260706120000_drop_legacy_payment_tables
```

Do **not** use `prisma migrate reset` or `prisma db push` for this — both
are destructive/out-of-band relative to the tracked migration history.

**Immediately verify** (read-only):

```bash
npx prisma migrate status
```

Expect: `20260706100000_add_payment_method` listed as applied,
`20260706120000_drop_legacy_payment_tables` listed as **not yet applied**.

```sql
-- Read-only. Confirm the new table exists and is empty, and the legacy
-- tables are untouched.
SELECT to_regclass('"PaymentMethod"')          AS payment_method_table;
SELECT count(*) FROM "PaymentMethod";           -- expect 0
SELECT count(*) FROM "Bank";                    -- expect unchanged pre-migration count
SELECT count(*) FROM "CryptoWallet";            -- expect unchanged pre-migration count
SELECT count(*) FROM "PaymentMethodConfig";     -- expect unchanged pre-migration count
```

At this point the currently-deployed (old) application code is completely
unaffected — it never queries `PaymentMethod` and keeps serving checkout
and admin payments from the legacy tables exactly as before. **Do not
deploy the new application code yet.**

### If something looks wrong after step 1

The migration is purely additive, so rollback is trivial and lossless:

```sql
-- Read/write, but only touches the brand-new empty table.
DROP TABLE IF EXISTS "PaymentMethod";
```

Then, to keep Prisma's migration history consistent, mark it rolled back:

```bash
npx prisma migrate resolve --rolled-back 20260706100000_add_payment_method
```

---

## Step 2 — Run the backfill script

Run this from the same checkout used in step 1 (this PR's branch, with
`DATABASE_URL` pointed at production):

```bash
npx tsx scripts/backfill-payment-methods.ts
```

What it does: reads `Bank`, `CryptoWallet`, `PaymentMethodConfig` (via raw
SQL, since those tables aren't in this branch's Prisma schema anymore) and
the `paymentDisplay` branding map inside the `StoreSetting` row, and inserts
one `PaymentMethod` row per legacy bank/wallet/paypal-config/card-config,
inside a single transaction.

**Is it safe to re-run?** Yes.
- If `PaymentMethod` already has any rows, the script prints a message and
  exits immediately without touching anything — safe to run again after a
  successful prior run (it's a no-op).
- If a run fails partway through, the transaction rolls back, so
  `PaymentMethod` is left at 0 rows — a re-run behaves like the first run,
  not like a partial-skip. You do not need to manually clean up after a
  failed run before re-running it.
- The only case that needs a manual step: if you inspect the data after a
  "successful" run and decide it's wrong (e.g. a mapping bug), the
  count-guard means a plain re-run will just skip. Explicitly empty it first:
  `TRUNCATE TABLE "PaymentMethod";` (safe at this stage — see the note in
  step 3 about why this is only safe *before* the application deploy in
  step 4), then re-run the script.

The legacy tables (`Bank`, `CryptoWallet`, `PaymentMethodConfig`) are only
read, never modified or deleted, by this script.

---

## Step 3 — Read-only verification (before touching anything else)

Run all of these as plain `SELECT`s — none of them write anything.

```sql
-- 1. Row counts line up: total PaymentMethod rows should equal
--    (bank rows) + (wallet rows) + (1 if a paypal config existed)
--    + (1 if a card config existed).
SELECT count(*) FROM "Bank";
SELECT count(*) FROM "CryptoWallet";
SELECT count(*) FROM "PaymentMethodConfig";
SELECT type, count(*) FROM "PaymentMethod" GROUP BY type ORDER BY type;

-- 2. No duplicate/colliding sort order (would break list ordering).
SELECT "sortOrder", count(*)
FROM "PaymentMethod"
GROUP BY "sortOrder"
HAVING count(*) > 1;
-- expect: 0 rows

-- 3. Required per-type fields actually carried over.
SELECT id, name, details->>'rib' AS rib, details->>'accountNumber' AS account_number
FROM "PaymentMethod" WHERE type = 'bank';

SELECT id, name, details->>'walletAddress' AS wallet_address, details->>'network' AS network
FROM "PaymentMethod" WHERE type = 'crypto';

SELECT id, name, details->>'email' AS email, details->>'meLink' AS me_link
FROM "PaymentMethod" WHERE type = 'paypal';

-- Manually eyeball: every bank row has rib or account_number non-empty,
-- every crypto row has wallet_address non-empty, every paypal row has
-- email or me_link non-empty. If any active+visible row is missing its
-- required field, the new admin UI will (correctly) flag it as incomplete
-- — decide whether to fix the data now or after cutover.

-- 4. Branding carried over sanely (spot check against what you remember
--    configuring, e.g. via the old "Logos et cartes de paiement" settings).
SELECT id, name, initials, "accentColor", "logoUrl", "logoType" FROM "PaymentMethod";

-- 5. Status/visibility line up with what was enabled before.
SELECT id, name, type, status, visible FROM "PaymentMethod" ORDER BY "sortOrder";
```

Also do a **read-only application-level check** once you're ready to
proceed: point a local dev environment's `DATABASE_URL` at a read replica or
a fresh branch/snapshot of production (never the primary write path) and
open `/admin` → Store settings → Payment methods to visually confirm the
list looks right. This is optional but catches display issues the raw SQL
above can miss.

Only proceed to step 4 once every check above looks correct. If not, see
the recovery note in step 2 (`TRUNCATE` + re-run) — safe as long as you
haven't deployed the new app code yet (step 4).

---

## Step 4 — Deploy the application code

**This is the deploy point — between the two migrations, not before either
one and not after both.**

- Deploying before migration 1: the new code calls `prisma.paymentMethod.*`
  everywhere payments are touched (checkout, `/payment/[id]`, admin). Without
  the table, every one of those requests throws. **Do not deploy before
  step 1.**
- Deploying after migration 2 (i.e. waiting until both migrations are
  applied before deploying): means the *old* code is left running against a
  database that no longer has `Bank`/`CryptoWallet`/`PaymentMethodConfig` —
  its checkout and payment pages would throw for every customer from the
  moment migration 2 lands until the deploy finishes. **Do not delay the
  deploy past migration 2.**
- Deploying here, right after backfill + verification and before migration
  2, is the only window where both the old and new code can each run
  successfully against the database as it exists at that moment.

Deploy this branch through your normal process now. Once it's live, run a
quick smoke test against production (read-only from the app's point of
view, no destructive action):
- Load `/admin` → Store settings → Payment methods — table renders, methods
  match what you verified in step 3.
- Load `/checkout` — payment method cards render.
- Place a real or throwaway test order through to `/payment/[id]` and
  confirm the method-specific instructions (RIB, wallet address, etc.)
  render correctly.

### If the new deploy has a problem

Roll back to the previous deployment (redeploy the prior build/commit). The
legacy tables are still fully intact at this point (migration 2 hasn't run),
so the old code resumes working immediately with no data loss.

One caveat to know about, not a blocker: any order placed *during* the
window the new code was live has `paymentMethod` set to a `PaymentMethod`
id (a cuid) rather than the old literal strings (`"bank"`, `"usdt"`, ...).
If you roll back to the old code, those specific orders' `/payment/[id]`
page will show a generic "not available" message instead of the bank/wallet
details, because the old code looks up `config.methods["<cuid>"]` and finds
nothing — the order record itself (items, status, totals) is untouched, this
only affects that one page's payment-instructions display for orders placed
in that window. Forward-fixing (re-deploying the new code) resolves it
immediately since the new code resolves those ids directly.

---

## Step 5 — Apply migration 2 (drop legacy tables)

Only after step 4's smoke test passes and the new code has been live and
stable for a reasonable soak period (your call — even a few hours of normal
traffic with no payment-related errors is a reasonable bar, since nothing
in the new code reads the legacy tables anymore).

Optional but recommended: take a second backup/snapshot checkpoint right
before this step, specifically covering `Bank`, `CryptoWallet`, and
`PaymentMethodConfig`, in case you need to recover their data after they're
dropped (see recovery note below).

```bash
npx prisma migrate deploy
```

At this point migration 1 is already applied and migration 2 is the only
thing pending, so this is safe to run as a plain `migrate deploy` — it will
apply exactly migration 2.

### If you need to recover after this step

The legacy tables are gone; recovery means restoring them (or just the rows
you need) from the backup taken before step 1 (or the optional second
backup before this step), e.g. via a Neon branch/point-in-time restore into
a scratch database, then copying the relevant rows back out. This is why
steps 1–4 are deliberately structured so you should essentially never need
to reach for this — by the time you run migration 2, the new table has
already been verified and running in production for a while.

---

## Step 6 — Final verification (read-only)

```bash
npx prisma migrate status
```

Expect: both migrations listed as applied, nothing pending.

```sql
-- Legacy tables are gone.
SELECT to_regclass('"Bank"'), to_regclass('"CryptoWallet"'), to_regclass('"PaymentMethodConfig"');
-- expect: all three NULL

-- PaymentMethod data is unaffected by the drop (it lives in a different table).
SELECT count(*) FROM "PaymentMethod";
-- expect: same count as verified in step 3
```

Then repeat the app-level smoke test from step 4 (admin payment methods
list, `/checkout`, a test order through `/payment/[id]`) once more, since
this is the final state the application will run in going forward.

---

## Summary sequence

```
backup
  → migrate deploy (migration 1 only, via the move-aside trick)
  → verify (read-only)
  → run backfill script
  → verify (read-only)
  → deploy application code            ← cutover point
  → smoke test (read-only, app-level)
  → migrate deploy (migration 2)
  → verify (read-only)
```
