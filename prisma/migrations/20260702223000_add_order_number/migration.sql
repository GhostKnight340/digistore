-- Add a stored, stable public order number (sequential, 1-based) to Order.
-- Replaces the previous position-based scheme (COUNT of earlier orders per row),
-- so every list/detail/email can render the same reference without a query.
--
-- Written idempotently: this deployment also provisions the column at runtime
-- (src/lib/db/prisma.ts) because it has no `migrate deploy` step, so applying
-- this migration after the runtime bootstrap must be a no-op rather than an error.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER;

-- Sequence backing the autoincrement default. Name/ownership match what Prisma
-- expects for `@default(autoincrement())` so introspection stays in sync.
CREATE SEQUENCE IF NOT EXISTS "Order_orderNumber_seq" AS INTEGER;
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"');
ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

-- Backfill only rows still missing a number, in creation order, offset past any
-- existing max so numbers stay chronological and never collide.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS seq
  FROM "Order" WHERE "orderNumber" IS NULL
)
UPDATE "Order" AS o
SET "orderNumber" = ordered.seq + COALESCE((SELECT MAX("orderNumber") FROM "Order"), 0)
FROM ordered
WHERE o."id" = ordered."id";

-- Advance the sequence monotonically past the highest assigned value.
DO $$ BEGIN PERFORM setval(
  '"Order_orderNumber_seq"',
  GREATEST(
    (SELECT COALESCE(MAX("orderNumber"), 0) FROM "Order"),
    (SELECT last_value FROM "Order_orderNumber_seq")
  ),
  true
); END $$;

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");
