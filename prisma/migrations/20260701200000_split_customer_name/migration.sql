-- Split Customer.name into firstName / lastName without losing data.
ALTER TABLE "Customer" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Customer" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

-- Backfill: first word -> firstName, remaining words -> lastName.
-- Collapses repeated whitespace before splitting so extra spaces don't
-- leak into either column.
UPDATE "Customer"
SET
  "firstName" = split_part(regexp_replace(trim(both ' ' from "name"), '\s+', ' ', 'g'), ' ', 1),
  "lastName" = trim(both ' ' from substring(
    regexp_replace(trim(both ' ' from "name"), '\s+', ' ', 'g')
    from length(split_part(regexp_replace(trim(both ' ' from "name"), '\s+', ' ', 'g'), ' ', 1)) + 1
  ));

ALTER TABLE "Customer" ALTER COLUMN "firstName" DROP DEFAULT;
ALTER TABLE "Customer" DROP COLUMN "name";
