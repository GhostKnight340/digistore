-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "marginPctOverride" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "marginPctOverride" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "fixedSuggestedPriceMad" INTEGER,
ADD COLUMN     "marginPctOverride" DECIMAL(6,3);

-- CreateTable
CREATE TABLE "ReloadlyProviderCost" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "reloadlyProductId" INTEGER NOT NULL,
    "productName" TEXT,
    "denominationType" TEXT NOT NULL,
    "recipientFaceValue" DECIMAL(18,4) NOT NULL,
    "recipientCurrency" TEXT NOT NULL,
    "senderCurrency" TEXT NOT NULL,
    "senderBaseCost" DECIMAL(18,6) NOT NULL,
    "discountPercentage" DECIMAL(9,4) NOT NULL,
    "senderFee" DECIMAL(18,6) NOT NULL,
    "senderFeePercentage" DECIMAL(9,4) NOT NULL,
    "recipientToSenderExchangeRate" DECIMAL(18,8),
    "computedProviderCost" DECIMAL(18,6) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReloadlyProviderCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingSyncRun" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "productsSynced" INTEGER NOT NULL DEFAULT 0,
    "costsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PricingSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReloadlyCostReconciliation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveredCodeId" TEXT,
    "reloadlyTransactionId" INTEGER,
    "environment" TEXT NOT NULL,
    "reloadlyProductId" INTEGER NOT NULL,
    "recipientFaceValue" DECIMAL(18,4),
    "estimatedProviderCost" DECIMAL(18,6),
    "actualProviderCost" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "differenceAmount" DECIMAL(18,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReloadlyCostReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReloadlyProviderCost_environment_reloadlyProductId_idx" ON "ReloadlyProviderCost"("environment", "reloadlyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ReloadlyProviderCost_environment_reloadlyProductId_recipien_key" ON "ReloadlyProviderCost"("environment", "reloadlyProductId", "recipientFaceValue");

-- CreateIndex
CREATE INDEX "PricingSyncRun_environment_startedAt_idx" ON "PricingSyncRun"("environment", "startedAt");

-- CreateIndex
CREATE INDEX "ReloadlyCostReconciliation_orderId_idx" ON "ReloadlyCostReconciliation"("orderId");

-- CreateIndex
CREATE INDEX "ReloadlyCostReconciliation_environment_createdAt_idx" ON "ReloadlyCostReconciliation"("environment", "createdAt");

