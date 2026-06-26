# Production Environment

Required for Vercel:

- `DATABASE_URL`: Supabase PostgreSQL connection string. It must start with `postgresql://` or `postgres://`.

Operational notes:

- Supabase/PostgreSQL is the source of truth for catalog, settings, payment configuration, orders, inventory, fulfillment, proofs, and events.
- The app no longer reads or writes SQLite for business data.
- `localStorage` is used only for the pre-checkout cart.
- Run `npx prisma migrate deploy` during deployment when possible. The app also creates missing tables on first DB access as a Vercel safety net.
- Run `npm run prisma:seed` only when intentionally syncing the default catalog seed data into an empty or reset database.
