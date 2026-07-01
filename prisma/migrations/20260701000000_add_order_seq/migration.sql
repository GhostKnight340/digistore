-- Add a stable, human-readable sequential order number.
-- The internal cuid `id` remains the routing/lookup key; `orderSeq` is what
-- customers and admins see (formatted as #000001).

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderSeq" INTEGER;

-- Backfill existing rows deterministically by creation order so historical
-- orders keep a stable number.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS seq
  FROM "Order"
)
UPDATE "Order" o
SET "orderSeq" = ordered.seq
FROM ordered
WHERE o."id" = ordered."id" AND o."orderSeq" IS NULL;

-- Sequence backing the autoincrement default (Prisma naming convention).
CREATE SEQUENCE IF NOT EXISTS "Order_orderSeq_seq" OWNED BY "Order"."orderSeq";

-- Advance the sequence past any backfilled values so the next insert is unique.
SELECT setval(
  '"Order_orderSeq_seq"',
  COALESCE((SELECT MAX("orderSeq") FROM "Order"), 0) + 1,
  false
);

ALTER TABLE "Order" ALTER COLUMN "orderSeq" SET DEFAULT nextval('"Order_orderSeq_seq"');
ALTER TABLE "Order" ALTER COLUMN "orderSeq" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderSeq_key" ON "Order"("orderSeq");

-- Rewrite historical EmailLog snapshots that stored the internal cuid as the
-- order number, replacing it with the human #000000 form while preserving the
-- id inside routing URLs (not preceded by a slash).
UPDATE "EmailLog" e
SET
  "subject" = REPLACE(e."subject", o."id", '#' || LPAD(o."orderSeq"::text, 6, '0')),
  "body"    = regexp_replace(e."body", '(^|[^/])' || o."id", '\1#' || LPAD(o."orderSeq"::text, 6, '0'), 'g'),
  "text"    = regexp_replace(e."text", '(^|[^/])' || o."id", '\1#' || LPAD(o."orderSeq"::text, 6, '0'), 'g'),
  "html"    = regexp_replace(e."html", '(^|[^/])' || o."id", '\1#' || LPAD(o."orderSeq"::text, 6, '0'), 'g')
FROM "Order" o
WHERE e."orderId" = o."id" AND e."subject" LIKE '%' || o."id" || '%';
