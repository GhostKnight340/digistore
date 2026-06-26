-- Add rich fields to Product
ALTER TABLE "Product" ADD COLUMN "shortDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN "longDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN "instructions" TEXT;
ALTER TABLE "Product" ADD COLUMN "brand" TEXT;

-- Add variant-level fields to ProductVariant
ALTER TABLE "ProductVariant" ADD COLUMN "faceValue" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN "faceCurrency" TEXT NOT NULL DEFAULT 'MAD';
ALTER TABLE "ProductVariant" ADD COLUMN "stockControl" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ProductVariant" ADD COLUMN "stockMode" TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE "ProductVariant" ADD COLUMN "supplierCost" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN "supplierCurrency" TEXT NOT NULL DEFAULT 'MAD';
ALTER TABLE "ProductVariant" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
