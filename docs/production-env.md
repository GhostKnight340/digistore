# Production Environment

Required for Vercel:

- `DATABASE_URL`: PostgreSQL connection string (pooled is fine for the app). Must start with `postgresql://` or `postgres://`.
- `DIRECT_URL`: direct (non-pooled) PostgreSQL connection string. Prisma Migrate uses this for `migrate deploy`. On Neon/Supabase this is the direct connection, not the pooled one.

Operational notes:

- PostgreSQL is the source of truth for catalog, settings, payment configuration, orders, inventory, fulfillment, proofs, and events.
- The app no longer reads or writes SQLite for business data.
- `localStorage` is used only for the pre-checkout cart.
- Run `npm run prisma:seed` only when intentionally syncing the default catalog seed data into an empty or reset database.

## Database schema & migrations

Schema is owned by **Prisma Migrate**. There is no runtime DDL anymore — the app
never alters the database schema at request time.

- On Vercel, the build command is `npm run vercel-build` (set in `vercel.json`),
  which runs `prisma generate` → `node scripts/prisma-migrate.mjs` → `next build`.
  So **`prisma migrate deploy` runs during the build, before the app starts.**
- `scripts/prisma-migrate.mjs` adopts migrations safely on the existing production
  database (which was originally built by the old runtime bootstrap, so it has no
  migration history). It baselines already-present migrations, then applies the new
  idempotent ones. It never drops or resets data.

See `docs/migrations.md` for the full workflow (local dev, adding migrations,
production adoption, and how existing data is protected).
