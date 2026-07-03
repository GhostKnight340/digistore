# Database migrations

Ghost.ma uses **Prisma Migrate** as the single source of truth for the database
schema. `prisma/schema.prisma` is the model; `prisma/migrations/*` are the ordered,
committed SQL migrations that build it. The application does **not** run any DDL at
runtime.

## How it runs in production (Vercel)

`vercel.json` sets the build command to `pnpm run vercel-build`:

```
prisma generate && node scripts/prisma-migrate.mjs && next build
```

So migrations are applied **during the build, before the app serves traffic**.
`scripts/prisma-migrate.mjs` wraps `prisma migrate deploy` with a one-time,
self-detecting baseline (see below). It runs migrations over a direct connection:
it uses `DIRECT_URL` if set, otherwise falls back to `POSTGRES_URL_NON_POOLING` /
`DATABASE_URL_UNPOOLED` / `DATABASE_URL`. Set `DIRECT_URL` to the direct, non-pooled
connection in the Vercel project for reliable migrations on pooled databases.

> If a Build Command is set in the Vercel dashboard, clear it (or set it to
> `pnpm run vercel-build`) so `vercel.json` is honored.

## Adopting Migrate on the existing production database (one-time, automatic)

Production was originally built by a runtime DDL bootstrap, not by Migrate, so it
has the full schema but (likely) no `_prisma_migrations` history. A plain
`prisma migrate deploy` would try to re-create existing tables and fail.

`scripts/prisma-migrate.mjs` handles this automatically and idempotently:

1. **`_prisma_migrations` exists** → run `prisma migrate deploy` (normal path).
2. **No history, but the schema exists** → *baseline*: mark every already-present
   migration as applied with `prisma migrate resolve --applied <name>`, then
   `prisma migrate deploy` runs only the new migrations.
3. **Empty database** → `prisma migrate deploy` creates everything from scratch.

The only migrations actually executed against an existing production database are
the ones listed in `APPLY_NOT_BASELINE` inside the script:

- `20260702223000_add_order_number`
- `20260703090000_reconcile_runtime_ddl`

Both are written idempotently (`ADD COLUMN IF NOT EXISTS`, `CREATE ... IF NOT
EXISTS`, guarded backfills, atomic index swaps), so they are safe whether or not
their objects already exist. Every earlier migration is baselined (marked applied),
never re-run — its changes are already present and the live app depends on them.

**No migration drops or truncates data.** `orderNumber` is backfilled in creation
order for existing rows before its `NOT NULL` + unique index are applied.

## Local development

- Change `prisma/schema.prisma`, then create a migration:
  ```
  pnpm prisma:migrate        # prisma migrate dev — creates + applies a migration locally
  ```
  Commit the generated folder under `prisma/migrations/`.
- Apply committed migrations without creating new ones (e.g. a teammate's):
  ```
  pnpm prisma:deploy         # prisma migrate deploy
  ```
- Inspect state:
  ```
  pnpm prisma:status         # prisma migrate status
  ```
- `pnpm build` is plain `next build` (no DB access) so local/CI builds don't
  require a database. Use `pnpm db:deploy` to run the production migration
  runner locally against a `DATABASE_URL`/`DIRECT_URL` you control.

## Adding a new migration later

1. Edit `schema.prisma`.
2. `pnpm prisma:migrate` to generate `prisma/migrations/<timestamp>_<name>/`.
3. Commit it. On deploy, `migrate deploy` applies it automatically.

New migrations do **not** need to be idempotent or added to `APPLY_NOT_BASELINE` —
once production has a `_prisma_migrations` history (after the first adoption
deploy), normal `migrate deploy` applies them. Idempotency was only needed for the
two adoption migrations that run against the pre-existing, un-baselined database.
