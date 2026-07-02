-- Add a stored, stable public order number (sequential, 1-based) to Order.
-- Replaces the previous position-based scheme (COUNT of earlier orders per row),
-- so every list/detail/email can render the same reference without a query.

ALTER TABLE "Order" ADD COLUMN "orderNumber" INTEGER;

-- Backfill existing orders in creation order so numbers stay chronological and
-- match whatever references were previously shown.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS seq
  FROM "Order"
)
UPDATE "Order" AS o
SET "orderNumber" = ordered.seq
FROM ordered
WHERE o."id" = ordered."id";

-- Sequence backing the autoincrement default. Name/ownership match what Prisma
-- expects for `@default(autoincrement())` so introspection stays in sync.
CREATE SEQUENCE IF NOT EXISTS "Order_orderNumber_seq" AS INTEGER;
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"');
ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

-- Point the sequence just past the highest backfilled value (1 on an empty table).
SELECT setval(
  '"Order_orderNumber_seq"',
  COALESCE((SELECT MAX("orderNumber") FROM "Order"), 0) + 1,
  false
);

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
