-- Automatic Reloadly fulfillment at payment-confirmation time. All columns
-- are nullable or defaulted additions — no data loss, fully backward
-- compatible with existing local/manual fulfillment and the existing
-- admin-triggered "Via Reloadly" delivery flow.

ALTER TABLE "ProductVariant" ADD COLUMN     "reloadlyAutomationEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem" ADD COLUMN     "fulfillmentStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "OrderItem" ADD COLUMN     "fulfillmentSource" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN     "fulfillmentError" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN     "reloadlyTransactionId" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN     "reloadlyOrderId" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN     "fulfillmentAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN     "lastFulfillmentAttemptAt" TIMESTAMP(3);

CREATE INDEX "OrderItem_fulfillmentStatus_idx" ON "OrderItem"("fulfillmentStatus");
