# Production Environment

Required for Vercel:

- `DATABASE_URL`: Supabase PostgreSQL connection string. It must start with `postgresql://` or `postgres://`.

Optional — Meta (Facebook) tracking:

- `NEXT_PUBLIC_META_PIXEL_ID`: Meta Pixel / dataset id from Events Manager. Enables the browser pixel; also used as the dataset for the Conversions API.
- `META_CONVERSIONS_API_ACCESS_TOKEN`: Conversions API access token (Events Manager → Settings → Conversions API → Generate access token). Enables server-side events.
- `META_TEST_EVENT_CODE`: optional; when set, server-side events appear in the Events Manager "Test events" tab. Leave unset in production.
- `META_GRAPH_API_VERSION`: optional Graph API version override (defaults to `v21.0`).

If the Meta variables are unset the tracking code is a complete no-op. See `docs/meta-tracking.md` for the event map and deduplication design.

Operational notes:

- Supabase/PostgreSQL is the source of truth for catalog, settings, payment configuration, orders, inventory, fulfillment, proofs, and events.
- The app no longer reads or writes SQLite for business data.
- `localStorage` is used only for the pre-checkout cart.
- Run `npx prisma migrate deploy` during deployment when possible. The app also creates missing tables on first DB access as a Vercel safety net.
- Run `npm run prisma:seed` only when intentionally syncing the default catalog seed data into an empty or reset database.
