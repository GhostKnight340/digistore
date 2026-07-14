-- Promo codes + Ghost Credit subsystem.
--
-- Purely additive: seven new tables plus two safe-default columns on existing
-- tables ("Order"."discountMad" DEFAULT 0, "Customer"."ghostCreditBalanceMad"
-- DEFAULT 0). No existing column is altered or dropped, so every current
-- product, category, order, and customer row is untouched and backward
-- compatible. Money is whole MAD (INTEGER), matching Order.totalMad; percentages
-- use DECIMAL(6,3) like the existing pricing overrides.

-- AlterTable (additive, safe defaults)
ALTER TABLE "Order" ADD COLUMN "discountMad" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "ghostCreditBalanceMad" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rewardType" TEXT NOT NULL,
    "percentValue" DECIMAL(6,3),
    "fixedAmountMad" INTEGER,
    "maxDiscountMad" INTEGER,
    "maxCreditMad" INTEGER,
    "creditExpiresInDays" INTEGER,
    "creditExpiresAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "maxTotalUses" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "loggedInOnly" BOOLEAN NOT NULL DEFAULT false,
    "minSubtotalMad" INTEGER,
    "maxSubtotalMad" INTEGER,
    "reservedUses" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeProduct" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeCategory" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "finalizedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPromotionSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "promoCodeId" TEXT,
    "code" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "configuredPercent" DECIMAL(6,3),
    "configuredFixedMad" INTEGER,
    "maxDiscountMad" INTEGER,
    "maxCreditMad" INTEGER,
    "eligibleSubtotalMad" INTEGER NOT NULL,
    "discountMad" INTEGER NOT NULL DEFAULT 0,
    "expectedCreditMad" INTEGER NOT NULL DEFAULT 0,
    "creditExpiresAt" TIMESTAMP(3),
    "eligibleLineItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lineAllocations" JSONB,
    "validationContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPromotionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GhostCreditTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountMad" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "promoCodeId" TEXT,
    "orderId" TEXT,
    "rewardType" TEXT,
    "eligibleSubtotalMad" INTEGER,
    "configuredPercent" DECIMAL(6,3),
    "configuredFixedMad" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'system',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GhostCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeEvent" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_active_idx" ON "PromoCode"("active");
CREATE INDEX "PromoCode_archivedAt_idx" ON "PromoCode"("archivedAt");
CREATE INDEX "PromoCode_rewardType_idx" ON "PromoCode"("rewardType");

-- CreateIndex
CREATE INDEX "PromoCodeProduct_promoCodeId_idx" ON "PromoCodeProduct"("promoCodeId");
CREATE INDEX "PromoCodeProduct_productId_idx" ON "PromoCodeProduct"("productId");
CREATE UNIQUE INDEX "PromoCodeProduct_promoCodeId_productId_key" ON "PromoCodeProduct"("promoCodeId", "productId");

-- CreateIndex
CREATE INDEX "PromoCodeCategory_promoCodeId_idx" ON "PromoCodeCategory"("promoCodeId");
CREATE INDEX "PromoCodeCategory_categoryId_idx" ON "PromoCodeCategory"("categoryId");
CREATE UNIQUE INDEX "PromoCodeCategory_promoCodeId_categoryId_key" ON "PromoCodeCategory"("promoCodeId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_orderId_key" ON "PromoRedemption"("orderId");
CREATE INDEX "PromoRedemption_promoCodeId_status_idx" ON "PromoRedemption"("promoCodeId", "status");
CREATE INDEX "PromoRedemption_promoCodeId_customerEmail_idx" ON "PromoRedemption"("promoCodeId", "customerEmail");
CREATE INDEX "PromoRedemption_customerId_idx" ON "PromoRedemption"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPromotionSnapshot_orderId_key" ON "OrderPromotionSnapshot"("orderId");
CREATE INDEX "OrderPromotionSnapshot_promoCodeId_idx" ON "OrderPromotionSnapshot"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "GhostCreditTransaction_idempotencyKey_key" ON "GhostCreditTransaction"("idempotencyKey");
CREATE INDEX "GhostCreditTransaction_customerId_status_idx" ON "GhostCreditTransaction"("customerId", "status");
CREATE INDEX "GhostCreditTransaction_orderId_idx" ON "GhostCreditTransaction"("orderId");
CREATE INDEX "GhostCreditTransaction_promoCodeId_idx" ON "GhostCreditTransaction"("promoCodeId");

-- CreateIndex
CREATE INDEX "PromoCodeEvent_promoCodeId_idx" ON "PromoCodeEvent"("promoCodeId");

-- AddForeignKey
ALTER TABLE "PromoCodeProduct" ADD CONSTRAINT "PromoCodeProduct_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeProduct" ADD CONSTRAINT "PromoCodeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeCategory" ADD CONSTRAINT "PromoCodeCategory_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeCategory" ADD CONSTRAINT "PromoCodeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPromotionSnapshot" ADD CONSTRAINT "OrderPromotionSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderPromotionSnapshot" ADD CONSTRAINT "OrderPromotionSnapshot_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GhostCreditTransaction" ADD CONSTRAINT "GhostCreditTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GhostCreditTransaction" ADD CONSTRAINT "GhostCreditTransaction_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GhostCreditTransaction" ADD CONSTRAINT "GhostCreditTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeEvent" ADD CONSTRAINT "PromoCodeEvent_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
