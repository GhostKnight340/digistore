# Ghost.ma — Production Smoke Test

Run immediately after every production deploy (and against staging after a
staging deploy). ~5 minutes. Goal: confirm the site is up and the critical
surfaces respond — **not** to place a real order.

Set `BASE=https://ghost.ma` (or `https://staging.ghost.ma`).

## Automated (curl) — responds + correct status

```bash
BASE=https://ghost.ma
for path in / /products /search "/guides" /support /sitemap.xml /robots.txt; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  echo "$code  $path"
done
```
- [ ] Homepage `/` → 200
- [ ] Catalogue `/products` → 200
- [ ] Search `/search` → 200
- [ ] `/sitemap.xml` → 200, lists only public URLs
- [ ] `/robots.txt` → **production**: `Allow: /` + sitemap; **staging**: `Disallow: /`
- [ ] One product page loads (pick a real slug): `/products/<slug>` → 200

## Manual (browser) — 2 minutes
- [ ] Homepage renders; **staging banner present on staging, absent on production**.
- [ ] Search a known alias (e.g. "PSN") → relevant results.
- [ ] Open a product → region + denomination selectors work; price in DH.
- [ ] Add to cart → cart shows correct total.
- [ ] Open `/checkout` → loads; only admin-enabled payment methods appear.
- [ ] Log in with a test account → account area loads.
- [ ] Admin: `/admin` login works; dashboard + orders load.

## Health checks
- [ ] Database read/write: a fresh order draft or admin list loads (no P2022/500).
- [ ] Email provider: `RESEND_API_KEY` present in prod; a recent `EmailLog` row is `pending`/`sent` (not `failed`) — or send a verification to a test address.
- [ ] Provider APIs: PayPal button renders (configured); Reloadly smoke (`npm run reloadly:smoke-test`) lists products.
- [ ] Cron endpoints reachable and reject a missing/incorrect `CRON_SECRET` (401/503).
- [ ] Error monitoring receiving events (once configured).

## Do NOT
- Do **not** place a real paid order in production as a smoke test unless an
  explicit, safe synthetic-order mode is enabled and later reconciled.
- Do **not** run any email/provider test from staging against real recipients.

If any critical item fails, use an [emergency lever](release-process.md#emergency-levers-no-deploy-required)
or roll back before investigating.
