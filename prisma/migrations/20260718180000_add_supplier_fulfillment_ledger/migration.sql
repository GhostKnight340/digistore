-- FazerCards production integration: supplier fulfillment ledger, synced
-- supplier catalog, supplier webhook events, and the supporting columns.
--
-- Strictly ADDITIVE. No column is dropped, renamed or retyped, and every new
-- column is nullable or carries a default, so this migration is safe to apply
-- to a live database while the previous release is still serving traffic.
-- Rolling back = the new tables/columns simply go unused.

-- ── Supplier: sync outcome, subscription snapshot, balance thresholds ───────
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "lastSyncOk" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "lastSyncMessage" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "planName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "subscriptionActive" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "lastLatencyMs" INTEGER;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "warningBalance" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "criticalBalance" TEXT;

-- ── VariantSupplierMapping: structured provider params + buyer-field spec ───
ALTER TABLE "VariantSupplierMapping" ADD COLUMN IF NOT EXISTS "supplierParams" JSONB;
ALTER TABLE "VariantSupplierMapping" ADD COLUMN IF NOT EXISTS "requiredBuyerFields" JSONB;

-- ── OrderItem: buyer inputs captured at checkout (top-up player_id, …) ──────
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "buyerFields" JSONB;

-- ── Supplier fulfillment ledger ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SupplierFulfillment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "supplier" TEXT NOT NULL,
    "serviceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerStatus" TEXT,
    "deliveryPayload" JSONB,
    "responseSnapshot" JSONB,
    "costAmount" DECIMAL(18,6),
    "costCurrency" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "reconcileCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "correlationId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierFulfillment_pkey" PRIMARY KEY ("id")
);

-- The concurrency guard: two simultaneous fulfillment runs for the same slot
-- race on this index and exactly one wins. Do NOT drop this.
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierFulfillment_orderItemId_slotIndex_key"
    ON "SupplierFulfillment"("orderItemId", "slotIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierFulfillment_idempotencyKey_key"
    ON "SupplierFulfillment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "SupplierFulfillment_status_nextPollAt_idx"
    ON "SupplierFulfillment"("status", "nextPollAt");
CREATE INDEX IF NOT EXISTS "SupplierFulfillment_supplier_status_idx"
    ON "SupplierFulfillment"("supplier", "status");
CREATE INDEX IF NOT EXISTS "SupplierFulfillment_orderId_idx"
    ON "SupplierFulfillment"("orderId");
CREATE INDEX IF NOT EXISTS "SupplierFulfillment_providerOrderId_idx"
    ON "SupplierFulfillment"("providerOrderId");

ALTER TABLE "SupplierFulfillment" DROP CONSTRAINT IF EXISTS "SupplierFulfillment_orderId_fkey";
ALTER TABLE "SupplierFulfillment" ADD CONSTRAINT "SupplierFulfillment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierFulfillment" DROP CONSTRAINT IF EXISTS "SupplierFulfillment_orderItemId_fkey";
ALTER TABLE "SupplierFulfillment" ADD CONSTRAINT "SupplierFulfillment_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DeliveredCode → ledger slot (exactly-once delivery guarantee) ───────────
ALTER TABLE "DeliveredCode" ADD COLUMN IF NOT EXISTS "supplierFulfillmentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveredCode_supplierFulfillmentId_key"
    ON "DeliveredCode"("supplierFulfillmentId");

-- ── Synced supplier catalog ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SupplierCatalogItem" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalParentId" TEXT NOT NULL DEFAULT '',
    "parentName" TEXT,
    "name" TEXT NOT NULL,
    "priceAmount" DECIMAL(18,6),
    "priceCurrency" TEXT,
    "stock" INTEGER,
    "minQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "platform" TEXT,
    "region" TEXT,
    "regionRestriction" TEXT,
    "buyerFields" JSONB,
    "providerMeta" JSONB,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierCatalogItem_supplier_serviceType_externalParentId_ex_key"
    ON "SupplierCatalogItem"("supplier", "serviceType", "externalParentId", "externalId");
CREATE INDEX IF NOT EXISTS "SupplierCatalogItem_supplier_serviceType_available_idx"
    ON "SupplierCatalogItem"("supplier", "serviceType", "available");
CREATE INDEX IF NOT EXISTS "SupplierCatalogItem_supplier_available_name_idx"
    ON "SupplierCatalogItem"("supplier", "available", "name");

-- ── Supplier webhook events (dedupe + audit) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "SupplierWebhookEvent" (
    "id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierWebhookEvent_supplier_eventId_key"
    ON "SupplierWebhookEvent"("supplier", "eventId");
CREATE INDEX IF NOT EXISTS "SupplierWebhookEvent_supplier_status_createdAt_idx"
    ON "SupplierWebhookEvent"("supplier", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SupplierWebhookEvent_providerOrderId_idx"
    ON "SupplierWebhookEvent"("providerOrderId");
