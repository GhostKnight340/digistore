-- PayPal automated payment support. All new Order columns are nullable
-- additions (null == manual/non-PayPal order) — fully backward compatible
-- with existing bank/crypto/manual flows. PaymentWebhookEvent is a new
-- table used purely for verified-webhook idempotency.
ALTER TABLE "Order" ADD COLUMN     "paymentProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderCaptureId" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderRawStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderAmount" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN     "paymentProviderCurrency" TEXT;
ALTER TABLE "Order" ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_paymentProviderOrderId_key" ON "Order"("paymentProviderOrderId");
CREATE UNIQUE INDEX "Order_paymentProviderCaptureId_key" ON "Order"("paymentProviderCaptureId");
CREATE INDEX "Order_paymentProviderOrderId_idx" ON "Order"("paymentProviderOrderId");

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "orderId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentWebhookEvent_eventId_key" ON "PaymentWebhookEvent"("eventId");
CREATE INDEX "PaymentWebhookEvent_provider_idx" ON "PaymentWebhookEvent"("provider");
CREATE INDEX "PaymentWebhookEvent_orderId_idx" ON "PaymentWebhookEvent"("orderId");
