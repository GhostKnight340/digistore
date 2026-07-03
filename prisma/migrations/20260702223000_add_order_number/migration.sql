-- Add a stored, stable public order number (sequential, 1-based) to Order.
-- Replaces the previous position-based scheme (COUNT of earlier orders per row),
-- so every list/detail/email can render the same reference without a query.
--
-- Written idempotently so it is safe to apply against the pre-existing production
-- database during Migrate adoption (the column may already have been provisioned
-- by the old runtime bootstrap): every object uses IF NOT EXISTS and the backfill
-- only touches rows still missing a number.

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

-- Advance the sequence past the highest assigned number, but only when rows exist
-- so a fresh database still issues #000001 first (setval on an empty table would
-- otherwise make the first order #000002).
DO $$
DECLARE max_number integer;
BEGIN
  SELECT MAX("orderNumber") INTO max_number FROM "Order";
  IF max_number IS NOT NULL THEN
    PERFORM setval('"Order_orderNumber_seq"', max_number, true);
  END IF;
END $$;

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");
