-- Reconstructed 2026-07-08 from production introspection to close a gap
-- between this repo's tracked migration history and what was actually
-- applied to production directly (outside a checked-in migration file).
-- Functionally equivalent to what's live; not necessarily byte-identical to
-- whatever raw SQL/DDL was originally run.

-- Index used by admin order lookups by customer.
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- New products default to featured on the storefront.
ALTER TABLE "Product" ALTER COLUMN "featured" SET DEFAULT true;

-- Explicit DB-level defaults for updatedAt columns, so a row inserted
-- outside Prisma Client (raw SQL, another tool) still gets a sane initial
-- value rather than NULL. Prisma's @updatedAt continues to handle
-- update-time refresh at the application layer as before.
ALTER TABLE "Product" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Category" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProductVariant" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DigitalCode" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Customer" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailLog" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StoreSetting" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
