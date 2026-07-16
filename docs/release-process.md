# Ghost.ma — Release & Rollback Process

How a change goes from a branch to production safely, and how to undo it. Pairs
with [`launch-readiness-checklist.md`](launch-readiness-checklist.md),
[`smoke-test.md`](smoke-test.md), and [`db-safety.md`](db-safety.md).

Environments: **production** = `main` → `ghost.ma` (`VERCEL_ENV=production`,
prod Neon, live PayPal/Reloadly, prod email/Discord/analytics). **staging** =
`staging` branch → `staging.ghost.ma` (Vercel `staging` custom env, isolated
Neon branch, sandbox providers, allowlisted email, noindex). **preview** =
per-PR Vercel URL (sandbox, noindex).

---

## Release steps

1. **Branch from `staging`** (`feature/<name>`). Never commit straight to `main`.
2. **Preview deploy** — open a PR; Vercel builds a preview. Confirm it's noindex + sandbox.
3. **Feature QA** on the preview URL.
4. **Merge to `staging`.**
5. **Full staging QA** — run the relevant [checklist](launch-readiness-checklist.md) sections + [smoke test](smoke-test.md) against `staging.ghost.ma`. Confirm the staging banner shows and no real customer email is sent.
6. **Database migration test** — apply migrations on the staging Neon branch first. For multi-step/data migrations, follow a runbook; do **not** rely on a blind `prisma migrate deploy` (it runs every pending migration with nothing in between). See `docs/production-env.md`.
7. **Backup / checkpoint** — for any schema or data-shape change, note a Neon restore point / branch before deploying.
8. **Explicit production approval** — the owner signs off in the PR.
9. **Merge `staging` → `main`** — Vercel builds production. The build runs `prisma generate && prisma migrate deploy && next build`; a migration failure fails the deploy by design.
10. **Production smoke test** — run [`smoke-test.md`](smoke-test.md) against `ghost.ma`.
11. **Monitoring period** — watch error monitoring + Discord alerts for ~30–60 min. Verify one real end-to-end order path if launching.
12. **Rollback if needed** — see below.

---

## Rollback

### Fastest: Vercel instant rollback (no migration change)
Vercel dashboard → Deployments → previous good production deployment → **Promote/Rollback**. Instant; no rebuild. Use when the bad release did **not** change the DB schema.

### Git revert (code fix)
`git revert <sha>` on `main` (via PR through staging if time permits), let Vercel rebuild. Preferred over force-push; preserves history.

### When a migration was applied — forward-fix, not auto-rollback
**Prisma migrations are not guaranteed reversible.** `migrate deploy` has no
"down". Do **not** attempt to hand-roll a reverse migration under pressure.

- If the new code is bad but the schema is **backward-compatible** (additive
  columns/tables): roll back the code (Vercel/git). The unused new columns are harmless.
- If the schema change is **breaking**: forward-fix — ship a new migration that
  restores a compatible shape, or restore the database from a Neon branch/restore
  point taken at step 7 (accepting data written since the checkpoint is lost).
- Never `prisma migrate reset` or `db push` against production.

### Restore from backup (last resort)
Use Neon branching / point-in-time restore to the pre-release checkpoint. Coordinate with the owner: any orders/payments written after the checkpoint must be reconciled manually against PayPal/Reloadly/Discord records.

---

## Emergency levers (no deploy required)

- **Disable checkout** — admin store settings "Accept customer orders" OFF. Catalogue stays browsable; no new unfulfillable paid order can be created (enforced server-side in `createOrder`).
- **Disable a payment method** — admin payment config; it disappears everywhere immediately.
- **Maintenance mode** — admin store settings; shows the maintenance splash (admin/payment/order/delivery/find-order stay reachable).
- **Pause ads** — externally (ad platform); does not affect site operation.

---

## Incident communication

1. Flip the relevant emergency lever first (stop the bleeding).
2. Post to the private Discord ops channel: what's affected, customer impact, current mitigation.
3. If customers are affected (failed delivery/payment), prepare a support/email message — do not send from staging.
4. After resolution, add an entry to the audit trail and re-run the [checklist](launch-readiness-checklist.md) "after incident" pass.
