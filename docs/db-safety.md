# Database environment safety

Local development must **never** default to the production database. This
document explains the env-file layout, the production write-guard, and which
commands read vs. write.

## Env-file layout

| File | Holds | Loaded by |
|---|---|---|
| **`.env.local`** | your **dev** Neon branch | `npm run dev` (Next.js) and the tsx scripts (via `scripts/lib/load-env.mjs`) |
| **`.env.production.local`** | **production** `DATABASE_URL` / `DIRECT_URL` (+ `GHOST_DB_ENV=production`) | **only** `npm run prod:*` (via `scripts/prod-op.mjs`) — never by dev or normal scripts |
| **`.env`** | optional dev fallback | Next.js and, importantly, the **Prisma CLI** (`prisma migrate dev`, `prisma studio`) auto-load only this file |

Both `.env.local` and `.env.production.local` are gitignored. Template:
`.env.example`. **Never commit real values.**

> **Prisma CLI quirk:** `prisma migrate dev` / `prisma studio` auto-load `.env`
> only (not `.env.local`). If you use those dev commands directly, keep your dev
> creds in `.env`. The app (`npm run dev`) and the tsx scripts read `.env.local`
> first, then `.env`.

## Run local dev safely

1. Put your **dev** Neon branch creds in `.env.local` (and/or `.env`).
2. Do **not** put production creds in `.env` or `.env.local`. Production creds
   live only in `.env.production.local`.
3. `npm run dev` — always targets dev.

The guard (below) auto-detects if the active connection matches
`.env.production.local` and blocks writes even if prod creds leak into `.env`.

## Run a production migration intentionally

```bash
# 1. Read-only — see what's pending on production (safe, no confirmation):
npm run prod:status

# 2. Apply migrations to production (WRITE — requires explicit confirmation):
CONFIRM_PRODUCTION_DB=true npm run prod:migrate
```

`prod:*` load **only** `.env.production.local`, mark the target as production,
and (for writes) refuse to run unless `CONFIRM_PRODUCTION_DB=true`.

> Normal production migrations happen automatically on Vercel deploy
> (`prisma migrate deploy` in the build; see `docs/production-env.md`).
> `npm run prod:migrate` is the manual escape hatch.

## The production write-guard

`scripts/lib/db-guard.mjs` → `assertWriteAllowed(opName)`. A run targets
production when **either**:
1. `GHOST_DB_ENV=production` is set (the `prod:*` scripts set it; recommended in
   `.env.production.local`), **or**
2. the active DB host matches the host in `.env.production.local` (catches prod
   creds that accidentally end up in `.env` / `.env.local`).

If a **write** op targets production without `CONFIRM_PRODUCTION_DB=true`, the
command aborts with a clear message. The guard never prints connection strings.

Guarded write scripts: `prisma db seed`, `reloadly:cost-sync`, and any prod
`migrate deploy` / `db push` via `prod-op.mjs`. Add
`assertWriteAllowed("<name>")` to the top of any new DB-writing script.

## Command reference — read-only vs. writes

**Read-only (safe):**
- `npm run dev` — app; reads only.
- `npm run prod:status` — `prisma migrate status` against production; read-only.
- `npm run reloadly:smoke-test` — lists Reloadly products; no DB writes.
- `npm run db:studio` — Prisma Studio (can write if you edit rows — treat with care).
- `npm test` — pure unit tests; no DB.

**Writes to the database (guarded / intentional):**
- `npm run prod:migrate` — applies migrations to **production**. Requires `CONFIRM_PRODUCTION_DB=true`.
- `npm run prisma:seed` — seeds catalog + test codes. Guarded against prod.
- `npm run reloadly:cost-sync` — upserts provider-cost rows. Guarded against prod.
- `npm run prisma:migrate` — `prisma migrate dev` against your **dev** `.env` DB.
- `npm run build` — runs `prisma migrate deploy`; on Vercel this migrates production (intended). Do **not** run locally against a production `.env`.

## Adding a new write script

1. Load env via `scripts/lib/load-env.mjs` (dev) — never load `.env.production.local` for a normal script.
2. Call `assertWriteAllowed("your-script")` before any write.
3. For a deliberately production-targeting op, route it through `scripts/prod-op.mjs`.
