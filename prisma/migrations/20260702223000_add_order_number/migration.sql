-- Adds a sequential public order number to Order. Not currently read by
-- application code (public order numbers are computed on the fly from
-- creation-order sequence — see src/lib/orderNumber.ts) but the column is
-- live on production, so it's tracked here rather than silently dropped.
ALTER TABLE "Order" ADD COLUMN "orderNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
