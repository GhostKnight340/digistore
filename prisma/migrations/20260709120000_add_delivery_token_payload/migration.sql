-- Secure delivery: per-order secret token for the delivery-page link, plus a
-- normalized structured payload for provider deliveries (e.g. Reloadly). Both
-- additions are nullable — no data loss, fully backward compatible.
ALTER TABLE "Order" ADD COLUMN     "deliveryToken" TEXT;
ALTER TABLE "DeliveredCode" ADD COLUMN     "deliveryPayload" JSONB;

-- Backfill an unguessable token for orders already delivered, so their codes
-- can be revealed via a token link (and never via the enumerable order number).
-- gen_random_uuid() is available on Neon/Postgres 13+ (pgcrypto built in).
UPDATE "Order"
SET "deliveryToken" = replace(gen_random_uuid()::text, '-', '')
WHERE "status" = 'delivered' AND "deliveryToken" IS NULL;

CREATE UNIQUE INDEX "Order_deliveryToken_key" ON "Order"("deliveryToken");
