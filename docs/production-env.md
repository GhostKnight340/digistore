# Production Environment

Required for Vercel:

- `DATABASE_URL`: PostgreSQL connection string (pooled is fine for the running app). Must start with `postgresql://` or `postgres://`.
- `DIRECT_URL`: **required for deploys.** A direct, non-pooled PostgreSQL connection used by `prisma migrate deploy` at build time. The pooled `DATABASE_URL` (Neon `-pooler` host / `pgbouncer=true`, or Supabase port 6543) is **not** migration-capable — set `DIRECT_URL` to the direct endpoint (Neon: the non-`-pooler` host; Supabase: port 5432). The build now **fails** if migrations can't be applied (see below), so a missing/invalid `DIRECT_URL` will fail the deploy instead of silently skipping.

Optional (feature-gated):

- `RELOADLY_CLIENT_ID`, `RELOADLY_CLIENT_SECRET`, `RELOADLY_ENV`: Reloadly gift card supplier API. Not required — the app has no fulfillment dependency on Reloadly yet. See `docs/reloadly-integration.md`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: PayPal automated payment method (Orders API v2). Not required — without these, a `paypal`-type payment method falls back to being unusable at checkout (the button reports "not configured") rather than failing closed on a real charge. See `docs/paypal-integration.md`.

Operational notes:

- Supabase/PostgreSQL is the source of truth for catalog, settings, payment configuration, orders, inventory, fulfillment, proofs, and events.
- The app no longer reads or writes SQLite for business data.
- `localStorage` is used only for the pre-checkout cart.
- Schema changes reach production **only** via `npx prisma migrate deploy`. The Vercel `build` script runs it automatically: `prisma generate && prisma migrate deploy && next build`.
  - **Migration failures fail the deploy (by design).** The `&&` chain means that if `prisma migrate deploy` exits non-zero, `next build` never runs and the whole build fails. This is deliberate: a schema problem must surface **at deploy time**, not later as a runtime 500 (`PrismaClientKnownRequestError … The column X does not exist` / P2022). Previously this step was best-effort — a failure was swallowed (`|| echo …`) so the build shipped against a stale schema and columns went missing at runtime. That swallow has been removed.
  - Migrations use `DIRECT_URL` (see the required-vars section). Without a migration-capable direct connection the deploy now **fails fast** rather than silently skipping.
  - There is **no** runtime DDL fallback: `ensureDatabaseReady()` only seeds catalog categories + the default store setting; it does not create tables/columns or run data migrations. So if migrations don't apply, the app *will* 500 on the first query that touches a missing column — which is exactly why the build must fail instead.
  - Confirm the build log shows `Applying migration …` for each expected migration.
- Run `npm run prisma:seed` only when intentionally syncing the default catalog seed data into an empty or reset database.
- **Exception:** releases that ship more than one migration with a required data-migration step in between must NOT rely on a plain automatic `prisma migrate deploy` — it applies every pending migration in one run with nothing between them. Check the PR for a migration runbook (e.g. `docs/payment-methods-migration-runbook.md`) before deploying; if the automatic deploy step would run `prisma migrate deploy` for you, disable it for that release and follow the runbook's staged commands manually instead.
