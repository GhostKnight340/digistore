CREATE TABLE "FulfillmentTestRun" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "stages" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "safeError" TEXT,
    "developerError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentTestRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FulfillmentTestRun_createdAt_idx" ON "FulfillmentTestRun"("createdAt");
CREATE INDEX "FulfillmentTestRun_supplier_environment_status_idx" ON "FulfillmentTestRun"("supplier", "environment", "status");
