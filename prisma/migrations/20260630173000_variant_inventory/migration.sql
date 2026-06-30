ALTER TABLE "DigitalCode"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT;

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "variantId" TEXT;

UPDATE "DigitalCode" dc
SET "variantId" = only_variant."id"
FROM (
  SELECT "productId", MIN("id") AS "id"
  FROM "ProductVariant"
  GROUP BY "productId"
  HAVING COUNT(*) = 1
) only_variant
WHERE dc."variantId" IS NULL
  AND dc."productId" = only_variant."productId";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DigitalCode_variantId_fkey'
  ) THEN
    ALTER TABLE "DigitalCode"
      ADD CONSTRAINT "DigitalCode_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_variantId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DigitalCode_variantId_status_idx"
  ON "DigitalCode"("variantId", "status");

CREATE INDEX IF NOT EXISTS "OrderItem_variantId_idx"
  ON "OrderItem"("variantId");
