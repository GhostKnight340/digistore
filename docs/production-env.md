# Production Environment

Required for Vercel:

- `DATABASE_URL`: Supabase PostgreSQL connection string. It must start with `postgresql://` or `postgres://`.

Optional (feature-gated):

- `RELOADLY_CLIENT_ID`, `RELOADLY_CLIENT_SECRET`, `RELOADLY_ENV`: Reloadly gift card supplier API. Not required — the app has no fulfillment dependency on Reloadly yet. See `docs/reloadly-integration.md`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: PayPal automated payment method (Orders API v2). Not required — without these, a `paypal`-type payment method falls back to being unusable at checkout (the button reports "not configured") rather than failing closed on a real charge. See `docs/paypal-integration.md`.

Operational notes:

- Supabase/PostgreSQL is the source of truth for catalog, settings, payment configuration, orders, inventory, fulfillment, proofs, and events.
- The app no longer reads or writes SQLite for business data.
- `localStorage` is used only for the pre-checkout cart.
- Schema changes reach production **only** via `npx prisma migrate deploy`. The Vercel `build` script runs it automatically (`prisma generate && prisma migrate deploy && next build`), but the step is best-effort: a failure is swallowed (`|| echo …`) so the build still succeeds. Migrations use `DIRECT_URL` (fallback `DATABASE_URL`) — set `DIRECT_URL` to a migration-capable direct connection (Supabase: the 5432 direct URL, not the 6543 pooled one), or migrations silently skip. There is **no** runtime DDL fallback: `ensureDatabaseReady()` only seeds catalog categories + the default store setting; it does not create tables/columns or run data migrations. Confirm the build log shows the migration applied (`Applying migration …`) rather than the `[build] prisma migrate deploy skipped/failed` echo.
- Run `npm run prisma:seed` only when intentionally syncing the default catalog seed data into an empty or reset database.
- **Exception:** releases that ship more than one migration with a required data-migration step in between must NOT rely on a plain automatic `prisma migrate deploy` — it applies every pending migration in one run with nothing between them. Check the PR for a migration runbook (e.g. `docs/payment-methods-migration-runbook.md`) before deploying; if the automatic deploy step would run `prisma migrate deploy` for you, disable it for that release and follow the runbook's staged commands manually instead.
