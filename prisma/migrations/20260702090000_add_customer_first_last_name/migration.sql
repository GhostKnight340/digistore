-- Add local first/last name fields to Customer.
ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "firstName" TEXT,
ADD COLUMN IF NOT EXISTS "lastName" TEXT;

-- Backfill from the existing single `name` column, preserving data:
--   first word            -> firstName
--   remaining words        -> lastName (NULL when there is only one word)
UPDATE "Customer"
SET
  "firstName" = NULLIF(split_part(btrim("name"), ' ', 1), ''),
  "lastName"  = NULLIF(btrim(regexp_replace(btrim("name"), '^\S+\s*', '')), '')
WHERE "firstName" IS NULL AND "lastName" IS NULL;
