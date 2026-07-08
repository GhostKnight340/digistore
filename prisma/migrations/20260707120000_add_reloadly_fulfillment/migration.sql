-- Reloadly optional per-variant fulfillment source. All columns are
-- nullable (or defaulted) additions — no data loss, fully backward
-- compatible with existing local/manual fulfillment.
ALTER TABLE "ProductVariant" ADD COLUMN     "reloadlyProductId" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN     "reloadlyCountryCode" TEXT;

ALTER TABLE "DeliveredCode" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "DeliveredCode" ADD COLUMN     "reloadlyTransactionId" INTEGER;
ALTER TABLE "DeliveredCode" ADD COLUMN     "reloadlyOrderId" INTEGER;
