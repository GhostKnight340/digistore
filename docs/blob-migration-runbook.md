# Product-image Blob migration + durable rate limiting — runbook

Branch: `feat/blob-images-and-durable-ratelimit` (off `staging`).
Status: implemented + validated on the **staging Neon branch**; **production run NOT executed** (awaiting approval).

---

## 1. What changed

### Priority 1 — product images off Postgres → Vercel Blob
- `ProductMedia` gained `blobUrl, pathname, width, height, mimeType, fileSize` (all nullable; legacy `url` kept for read-compat, **not** dropped).
- New uploads (`/api/upload`) go to a dedicated product-media Blob store (`PRODUCT_MEDIA_READ_WRITE_TOKEN`) under the `product-media/` prefix; base64-in-Postgres is retired.
- Catalog/list queries prefer `blobUrl` and no longer need the base64 `url`.
- Customer images render via `next/image`; strict `remotePatterns` added to **`next.config.mjs`** (the authoritative config — `next.config.ts` is ignored by Next).
- Migration script `scripts/migrate-product-images-to-blob.ts` (`pnpm images:migrate`): dry-run/apply/verify/orphans, idempotent, non-destructive, production-guarded.
- Blob delete-on-replace only when unreferenced; orphan detection in the script.

### Priority 2 — durable rate limiting + secure order lookup
- Limiter is now durable & shared: **Upstash Redis** primary (`@upstash/ratelimit`) → **Postgres `RateLimitCounter`** fallback → **fail-closed** if both are down.
- Escalating failure budgets (`orderLookupFail*`, `loginFailIp`).
- `findOrderAction`: logged-in customers confined to their own orders; uniform `{found:false}` (+timing pad) for not-found / wrong-email / unauthorized / rate-limited; no data disclosed pre-authorization.
- New `SecurityEvent` model + `logSecurityEvent()` (hashed identifier, never raw email) with Discord escalation via `notifySystemAlert`.

### Env vars added (see `.env.example`)
`PRODUCT_MEDIA_READ_WRITE_TOKEN`, `PRODUCT_MEDIA_BLOB_HOSTNAME` (optional), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SECURITY_LOG_SALT` (optional).

---

## 2. Staging verification report

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `pnpm test` (906 tests, incl. 25 new) | ✅ all pass |
| Migration `--dry-run` (staging) | ✅ detected **5** legacy base64 `Product.imageUrl` (224–518 KB each), 0 `ProductMedia.url` |
| Migration `--verify` baseline | legacy remaining **5**, migrated **0**, broken URLs n/a (no staging Blob token yet) |
| Storefront rendering (dev server) | ✅ catalogue + product page images render via `next/image`; 0 console errors |
| Payload win (measured on `steam-wallet`) | raw `/api/product-image` = **228,977 B** → `next/image` optimized = **8,287 B** (~27× smaller on the wire) |
| Durable limiter fallback (`dbConsume`) | ✅ 3 allowed / then denied; shared `RateLimitCounter` row persisted (count=3) |
| Secure lookup form submit | ✅ generic failure, no server error |

**Blocked pending staging credentials** (must be provisioned before the report is "clean"):
- `PRODUCT_MEDIA_READ_WRITE_TOKEN` (staging Blob store) → run `--apply` + `--verify` (broken-URL check) on staging.
- `UPSTASH_REDIS_REST_URL/TOKEN` (dev/staging) → exercise the Redis primary path end-to-end.
- A Vercel Preview deploy with the above scoped to Preview/Staging only.

Until those are set, the app safely uses: base64→`/api/product-image`→`next/image` for images, and the Postgres-counter limiter (proven above).

---

## 3. Production migration procedure (DO NOT RUN WITHOUT EXPLICIT APPROVAL)

Prereqs (Production Vercel env only):
1. Create a **separate production** public Vercel Blob store; set `PRODUCT_MEDIA_READ_WRITE_TOKEN` (+ optional `PRODUCT_MEDIA_BLOB_HOSTNAME`) in **Production** scope only.
2. Set `UPSTASH_REDIS_REST_URL/TOKEN` (production Upstash) in Production scope.
3. Confirm `next.config.mjs` `remotePatterns` matches the production Blob host (pin via `PRODUCT_MEDIA_BLOB_HOSTNAME`).

### Backups (required, before any write)
```
pnpm run prod:status                 # confirm target = production, migrations in sync
node scripts/db-backup.mjs           # full logical backup of the production DB
node scripts/db-verify-backup.mjs    # verify the backup is restorable
```
Also snapshot the Neon branch (Neon console → Branches → create a restore point).

### Apply DB migrations (additive only — no data change)
```
CONFIRM_PRODUCTION_DB=true pnpm run prod:migrate
# applies: 20260723150000_product_media_blob_fields
#          20260723160000_rate_limit_counter_and_security_event
```

### Deploy the branch to Production (after merge approval).

### Run the image migration against production
```
# The script HARD-REFUSES production by default. For the real run, temporarily
# point env at production Blob + DB and pass the explicit override:
CONFIRM_PRODUCTION_DB=true GHOST_DB_ENV=production pnpm images:migrate -- --verify   # baseline
CONFIRM_PRODUCTION_DB=true GHOST_DB_ENV=production pnpm images:migrate -- --apply     # migrate
CONFIRM_PRODUCTION_DB=true GHOST_DB_ENV=production pnpm images:migrate -- --verify    # must be CLEAN
```
> NOTE: the script's `activeDbIsProduction()` guard currently blocks production outright by design. For the approved production run, either (a) run it as a one-off with the guard relaxed to honor `CONFIRM_PRODUCTION_DB=true` like the other prod scripts, or (b) run from a trusted CI job. Decide with the owner; do not weaken the guard silently.

"Clean" = `legacy remaining: 0`, `broken Blob URLs: 0`.

### Revalidate the catalog cache (after the image migration)
`getActiveProductRows` / catalog DTOs are cached under `CATALOG_TAG` with **no TTL** — a DB-only migration does NOT refresh them, so the storefront keeps emitting `/api/product-image/<slug>`.

IMPORTANT (verified live on staging): a **redeploy does NOT clear this** — Vercel's Data Cache (which `unstable_cache` uses) **persists across deployments**. The ONLY way to refresh it is `revalidateTag(CATALOG_TAG)`:
- trigger any admin product/category save (it calls `revalidateTag(CATALOG_TAG)`), or
- add a one-off `revalidateTag(CATALOG_TAG)` call / route.

This is **cosmetic only**. Even without it, the payload win is fully realized: `Product.imageUrl` is now a Blob URL, so `/api/product-image/<slug>` **302-redirects to Blob** (no Postgres base64), and `next/image` optimizes from Blob. Measured live: a 3,144 KB base64 image now delivers as **13 KB WebP**. Revalidating only removes the one extra 302 hop by emitting the Blob URL directly.

Note: the `/api/product-image` responses are CDN-cached (`max-age=3600`); a fresh deploy serves them uncached (`x-vercel-cache: MISS`).

### Store environment scope (isolation)
The staging Blob store MUST be scoped to **Preview + Development only** in Vercel — NOT Production. If a "staging" store also has Production in scope, the production deployment shares that bucket and staging test objects live alongside real production media. Fix: Vercel → Storage → the store → environments → uncheck Production. Production must use its own separate **Public** store.

### Only after a clean verify + a soak period
- Drop `url` from the list `select` in `catalog.ts`/`categories.ts` (stops loading legacy base64 entirely).
- In a **later** migration, drop the `ProductMedia.url` column. Not before.

---

## 4. Expected impact
- Additive DB migration: no downtime, no row rewrites.
- Image migration: one Blob upload per legacy image (~5 products on staging; size TBD on prod). Reads stay working throughout (legacy base64 still served until each row flips to `blobUrl`).
- Runtime: catalog query payloads shrink (base64 no longer transferred once `Product.imageUrl` is rewritten); customer image bytes drop sharply via `next/image` (measured ~27× on a 224 KB card).
- Rate limiting becomes deployment-wide instead of per-instance.

## 5. Rollback
- **Migration is non-destructive**: legacy base64 in `Product.imageUrl` and `ProductMedia.url` is preserved; Blob writes use random suffixes (no overwrite).
- Code rollback: revert the branch → resolution falls back to `imageUrl ?? media.url` (base64), `/api/product-image` still serves bytes, `<img>` replaces `next/image`. No data loss.
- DB rollback: the new columns/tables are additive and inert if unused; leave them or drop in a follow-up.
- Blob cleanup after an abandoned migration: `pnpm images:migrate -- --orphans` (report), then `--apply --delete-orphans` to remove unreferenced objects.
- Limiter rollback: unset `UPSTASH_*` → automatically uses the Postgres counter; the module has no hard Redis dependency.

## 6. Known follow-ups (flagged, out of scope here)
- `next.config.ts` is dead config (Next uses `.mjs`); it still holds a wildcard image pattern + `serverExternalPackages`/webpack tweaks that are currently inert. Consolidate into `.mjs` or delete to avoid confusion.
- Admin "export product media as zip" (`/api/admin/product-media`) only zips inline base64; Blob-backed images are skipped (would need a remote fetch). Not customer-facing.
