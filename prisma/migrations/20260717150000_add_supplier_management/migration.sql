-- Supplier management (admin "Fournisseurs" section). Purely additive: two new
-- tables, no existing table or data touched. Static supplier metadata lives in
-- code (src/lib/suppliers/registry.ts); these tables store only operational
-- state and an outcome-only call log (no payloads, no credentials).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "balanceAmount" TEXT,
    "balanceCurrency" TEXT,
    "balanceUpdatedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierLog" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER,
    "orderId" TEXT,
    "productName" TEXT,
    "providerRef" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierLog_supplierId_createdAt_idx" ON "SupplierLog"("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierLog_supplierId_requestType_createdAt_idx" ON "SupplierLog"("supplierId", "requestType", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierLog_supplierId_ok_createdAt_idx" ON "SupplierLog"("supplierId", "ok", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierLog_supplierId_fkey') THEN
    ALTER TABLE "SupplierLog" ADD CONSTRAINT "SupplierLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
