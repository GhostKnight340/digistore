-- Variant ↔ supplier product mappings. Additive: one new table, one new
-- boolean on ProductVariant, plus a data backfill that copies the legacy
-- inline mapping columns (ProductVariant.reloadly* / fazercards*) into the
-- new table so existing configurations keep working unchanged. Legacy
-- columns are kept (not dropped) for backward compatibility.

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "manualFulfillmentAllowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "VariantSupplierMapping" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoFulfillEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "supplierProductId" TEXT NOT NULL,
    "supplierCategoryId" TEXT,
    "supplierKind" TEXT,
    "supplierProductName" TEXT,
    "supplierRegion" TEXT,
    "faceValue" DOUBLE PRECISION,
    "faceCurrency" TEXT,
    "costAmount" DOUBLE PRECISION,
    "costCurrency" TEXT,
    "costUpdatedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationOk" BOOLEAN,
    "lastValidationMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantSupplierMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VariantSupplierMapping_variantId_supplier_key" ON "VariantSupplierMapping"("variantId", "supplier");
CREATE INDEX IF NOT EXISTS "VariantSupplierMapping_supplier_enabled_idx" ON "VariantSupplierMapping"("supplier", "enabled");
CREATE INDEX IF NOT EXISTS "VariantSupplierMapping_variantId_priority_idx" ON "VariantSupplierMapping"("variantId", "priority");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VariantSupplierMapping_variantId_fkey') THEN
    ALTER TABLE "VariantSupplierMapping" ADD CONSTRAINT "VariantSupplierMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: legacy inline Reloadly mappings → one priority-1 mapping per
-- variant. Deterministic ids keep the backfill idempotent (IF NOT EXISTS via
-- ON CONFLICT DO NOTHING on the unique key).
INSERT INTO "VariantSupplierMapping" (
    "id", "variantId", "supplier", "enabled", "autoFulfillEnabled", "priority",
    "supplierProductId", "supplierRegion", "faceValue", "faceCurrency",
    "costAmount", "costCurrency"
)
SELECT
    'vsm-' || v."id" || '-reloadly',
    v."id",
    'reloadly',
    true,
    true,
    1,
    v."reloadlyProductId"::TEXT,
    v."reloadlyCountryCode",
    v."faceValue",
    v."faceCurrency",
    v."supplierCost",
    v."supplierCurrency"
FROM "ProductVariant" v
WHERE v."reloadlyProductId" IS NOT NULL
ON CONFLICT ("variantId", "supplier") DO NOTHING;

-- Backfill: legacy inline FazerCards mappings.
INSERT INTO "VariantSupplierMapping" (
    "id", "variantId", "supplier", "enabled", "autoFulfillEnabled", "priority",
    "supplierProductId", "supplierCategoryId", "supplierKind",
    "faceValue", "faceCurrency", "costAmount", "costCurrency"
)
SELECT
    'vsm-' || v."id" || '-fazercards',
    v."id",
    'fazercards',
    true,
    true,
    -- Priority 2 when the variant also has a Reloadly mapping, else 1.
    CASE WHEN v."reloadlyProductId" IS NOT NULL THEN 2 ELSE 1 END,
    v."fazercardsOfferId",
    v."fazercardsCategoryId",
    COALESCE(v."fazercardsKind", 'gift_card'),
    v."faceValue",
    v."faceCurrency",
    v."supplierCost",
    v."supplierCurrency"
FROM "ProductVariant" v
WHERE v."fazercardsOfferId" IS NOT NULL AND v."fazercardsCategoryId" IS NOT NULL
ON CONFLICT ("variantId", "supplier") DO NOTHING;
