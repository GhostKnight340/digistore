-- Add stockControl to Product.
-- "manual" (default) = always allow add-to-cart.
-- "auto"             = grey out / disable when unused codes = 0.
ALTER TABLE "Product" ADD COLUMN "stockControl" TEXT NOT NULL DEFAULT 'manual';
