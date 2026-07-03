-- Reconcile objects/drift that existed only via the removed runtime DDL bootstrap
-- (src/lib/db/prisma.ts, deleted in this change) with the migration history, so a
-- database built from migrations matches one built by the old runtime bootstrap.
--
-- Written idempotently: on production (already carrying these objects from the
-- runtime bootstrap) every statement is a no-op; on a fresh database it creates
-- the final state. Safe to `migrate deploy` against the live database.

-- Runtime-only index kept because getAccountOrders filters Order by customerId.
-- Now declared as @@index([customerId]) in schema.prisma; Prisma's default index
-- name matches the runtime name, so this is a no-op on production.
CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");

-- Runtime-only index dropped: redundant with @@index([active, sortOrder]), which
-- already covers "active"-only lookups. Not present in schema.prisma.
DROP INDEX IF EXISTS "Product_active_idx";

-- Align PaymentMethodConfig.cardMessage default with schema.prisma (accented "ô").
-- Affects future inserts only; existing rows are untouched.
ALTER TABLE "PaymentMethodConfig"
  ALTER COLUMN "cardMessage" SET DEFAULT 'Paiement par carte bientôt disponible.';

-- Normalise the DeliveredCode unique index: schema.prisma expects a plain unique
-- (@@unique([digitalCodeId])), but earlier migrations/runtime DDL created a partial
-- index (WHERE "digitalCodeId" IS NOT NULL). Both enforce the same guarantee in
-- PostgreSQL (NULLs are distinct); the swap is atomic inside the migration
-- transaction so the constraint is never absent.
DROP INDEX IF EXISTS "DeliveredCode_digitalCodeId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveredCode_digitalCodeId_key" ON "DeliveredCode"("digitalCodeId");
