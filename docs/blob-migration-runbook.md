# Production runbook — Blob images, durable rate limiting, hero optimizations

Branch: `feat/blob-images-and-durable-ratelimit` → merged into `staging` (deployed + verified on staging.ghost.ma). **Production NOT executed. Do not run without explicit approval.**

Staging is the `ep-green-pine` Neon branch; production is `ep-steep-flower`. The image *data* migration is a manual script that must be run against **each** environment's DB separately — the schema migrations auto-apply on deploy, the data migration does not.

---

## 1. What ships in this branch

**Priority 1 — product images off Postgres → Vercel Blob**
- `ProductMedia` + Blob columns; `/api/upload` writes to a dedicated product-media Blob store; catalog/list queries prefer `blobUrl`; customer images render via `next/image` (strict `remotePatterns` in `next.config.mjs`).
- Idempotent, resumable migration script `scripts/migrate-product-images-to-blob.ts`.

**Priority 2 — durable rate limiting + secure order lookup**
- Upstash Redis → Postgres `RateLimitCounter` fallback → fail-closed; escalating failure budgets; logged-in customers confined to their own orders; uniform failure; `SecurityEvent` audit + Discord escalation.

**Also in this branch (came out of staging perf review — safe, UI/code-only)**
- GTA homepage hero migrated to Blob + `next/image`.
- `admin.ts` fix: `saveGtaPreorderHeroImageAction` accepts product-media Blob URLs (REQUIRED — without it the GTA hero can't be saved once `/api/upload` returns Blob URLs).
- Navigator mascot + support-pill avatar → `next/image`; carousel dot 24×24 tap targets.

---

## 2. Staging verification report (final)

| Check | Result |
|---|---|
| `pnpm test` | ✅ 906 pass |
| `tsc --noEmit` | ✅ clean |
| Image migration (products) on staging | ✅ 9/9 → Blob, 0 base64, 0 broken |
| GTA hero on staging | ✅ migrated → Blob (1.09 MB base64 removed) |
| Homepage base64 images | ✅ 0 (was ~1.5 MB+) |
| Durable limiter | ✅ Redis→Postgres fallback proven (shared counter) |
| Real Lighthouse (desktop) | ✅ **98/100** — LCP 0.7 s, FCP 0.5 s, TBT 0, CLS 0 |

---

## 3. Pre-flight (before touching production)

1. **Production Blob store — MUST be Public.** `next/image` cannot serve customer images from a private store. Create/confirm a **production** public store and set `PRODUCT_MEDIA_READ_WRITE_TOKEN` in the **Production** Vercel scope only (staging store `product-media-staging` is Preview+Development only). ⚠️ The pre-existing `product-media-upload` store is Private — do NOT use it for this.
2. **Pin the image host:** set `PRODUCT_MEDIA_BLOB_HOSTNAME` = the production store host (`<storeId>.public.blob.vercel-storage.com`) in Production scope so `remotePatterns` is exact.
3. **Upstash (optional but recommended):** set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (production) in Production scope. Without them the limiter uses the Postgres counter (still durable).
4. **Get the production DB connection string from Neon** (not Vercel — the vars are "Sensitive"/write-only). You'll pass it to the migration script.
5. Merge the branch to `main` (this is the deploy — see step 6 ordering).

---

## 4. Backups (REQUIRED, before any write)

```
pnpm run prod:status                 # confirm target = production, migrations in sync
node scripts/db-backup.mjs           # full logical backup of production DB
node scripts/db-verify-backup.mjs    # verify the backup restores
```
Also create a Neon restore point (Neon console → Branches → the prod branch → restore point). Blob is additive (random-suffix keys, nothing overwritten), so no Blob backup is needed.

---

## 5. Production execution (ordered)

**a. Deploy the code + schema migrations.** Merge to `main` → production build runs `prisma migrate deploy`, applying:
- `20260723150000_product_media_blob_fields`
- `20260723160000_rate_limit_counter_and_security_event`

Both are additive (nullable columns + 2 new tables) — no downtime, no row rewrites. After deploy, product images still render (legacy base64 served via `/api/product-image` until the data migration flips each row).

**b. Run the image data migration against production.** The script hard-refuses production by default (staging-only guard). For the approved run, point env at the prod DB and confirm:
```
# baseline (read-only)
CONFIRM_PRODUCTION_DB=true DATABASE_URL="<prod pooled>" DIRECT_URL="<prod pooled>" \
  pnpm images:migrate -- --verify
# dry-run to see scale + sizes
CONFIRM_PRODUCTION_DB=true DATABASE_URL="<prod pooled>" DIRECT_URL="<prod pooled>" \
  pnpm images:migrate
# apply (products + GTA hero + any Collection/Category/Guide base64)
CONFIRM_PRODUCTION_DB=true DATABASE_URL="<prod pooled>" DIRECT_URL="<prod pooled>" \
  pnpm images:migrate -- --apply
# verify CLEAN
CONFIRM_PRODUCTION_DB=true DATABASE_URL="<prod pooled>" DIRECT_URL="<prod pooled>" \
  pnpm images:migrate -- --verify
```
> The script's `activeDbIsProduction()` guard blocks production by design. For the real run, relax it to honor `CONFIRM_PRODUCTION_DB=true` like the other prod scripts (`scripts/prod-op.mjs`), or run from a trusted CI job. Decide with the owner — do not weaken it silently.

"Clean" = `total legacy base64 remaining: 0`, `broken Blob URLs: 0`.

**c. Revalidate caches (REQUIRED — a redeploy does NOT clear Vercel's Data Cache).** `unstable_cache` (no TTL) will keep serving `/api/product-image` URLs and the old GTA hero until the tags are revalidated:
- `CATALOG_TAG` → trigger any admin product/category save (fires `revalidateTag`).
- `GTA_PREORDER_TAG` → **simplest: re-upload the GTA hero in the admin panel** (it uploads to Blob *and* revalidates in one step — this is the clean path; a plain migrate leaves the tag stale). If you don't have the source file, pull it from the Blob URL first (`curl <blobUrl> -o hero.jpg`).

Even before revalidation, no base64 is served from Postgres (the `/api/product-image` route 302-redirects to Blob once `imageUrl` is a Blob URL) — revalidation only removes the extra redirect hop.

---

## 6. Expected impact
- Deploy: no downtime; additive migration.
- Data migration: one Blob upload per legacy image; reads keep working throughout.
- Runtime: catalog query payloads shrink (base64 leaves Postgres); customer image bytes drop sharply (staging measured hero **3.1 MB → 13 KB WebP**, homepage **1.5 MB base64 → 0**, Lighthouse **84 → 98**).
- Security: rate limiting becomes deployment-wide (shared) instead of per-instance.

## 7. Rollback
- **Data migration is non-destructive** — legacy base64 in `Product.imageUrl`/`ProductMedia.url` is preserved; Blob writes use random suffixes.
- Code rollback: revert the branch → resolution falls back to base64 via `/api/product-image`; `next/image` reverts to `<img>`. No data loss.
- DB rollback: the new columns/tables are additive and inert if unused; drop them in a later migration if desired.
- Restore from backup / Neon restore point only if something unexpected corrupts data (not expected — nothing is deleted or overwritten).
- Limiter rollback: unset `UPSTASH_*` → auto-falls back to the Postgres counter.
- Orphaned Blobs from an abandoned run: `pnpm images:migrate -- --orphans` (report), then `--apply --delete-orphans`.

## 8. After a clean prod run + a soak period
- Remove `url` from the list `select` in `catalog.ts`/`categories.ts` (stops loading legacy base64 entirely).
- In a **later** migration, drop `ProductMedia.url`. Not before verification is clean and soaked.

## 9. Known follow-ups (out of scope, flagged)
- `next.config.ts` is dead config (Next uses `.mjs`); consolidate or delete.
- Admin "export product media as zip" only zips inline base64; Blob-backed images are skipped.
- TTFB ~689 ms on the homepage is server-render + Neon latency — a separate infra project (ISR/static homepage, DB round-trips, Vercel/Neon region colocation), not part of this work.
