-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CUSTOMER_ORDER_PAGE',
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedAmountMad" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "eligibilityDecision" TEXT,
    "rejectionReason" TEXT,
    "offeredResolutions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowSameVariantReplacement" BOOLEAN NOT NULL DEFAULT false,
    "assignedAdminId" TEXT,
    "assignedAdminName" TEXT,
    "supportRating" TEXT,
    "supportComment" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "customerChoiceAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundAttachment" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundMessage" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "templateKey" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "sentById" TEXT,
    "sentByName" TEXT,
    "deliveryResult" TEXT,
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundEvent" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundNote" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundResolution" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMad" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "selectedVariantId" TEXT,
    "selectedProductId" TEXT,
    "replacementLabel" TEXT,
    "replacementOrderId" TEXT,
    "originalPaymentMethod" TEXT,
    "transactionReference" TEXT,
    "proofUrl" TEXT,
    "processingNote" TEXT,
    "ghostCreditTxnId" TEXT,
    "selectedByCustomer" BOOLEAN NOT NULL DEFAULT true,
    "processedById" TEXT,
    "processedByName" TEXT,
    "selectedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundActionToken" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_seq_key" ON "RefundRequest"("seq");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_orderId_idx" ON "RefundRequest"("orderId");

-- CreateIndex
CREATE INDEX "RefundRequest_customerId_idx" ON "RefundRequest"("customerId");

-- CreateIndex
CREATE INDEX "RefundRequest_customerEmail_idx" ON "RefundRequest"("customerEmail");

-- CreateIndex
CREATE INDEX "RefundRequest_createdAt_idx" ON "RefundRequest"("createdAt");

-- CreateIndex
CREATE INDEX "RefundRequest_reason_idx" ON "RefundRequest"("reason");

-- CreateIndex
CREATE INDEX "RefundAttachment_refundRequestId_idx" ON "RefundAttachment"("refundRequestId");

-- CreateIndex
CREATE INDEX "RefundMessage_refundRequestId_createdAt_idx" ON "RefundMessage"("refundRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "RefundEvent_refundRequestId_createdAt_idx" ON "RefundEvent"("refundRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "RefundNote_refundRequestId_createdAt_idx" ON "RefundNote"("refundRequestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundResolution_refundRequestId_key" ON "RefundResolution"("refundRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundActionToken_tokenHash_key" ON "RefundActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefundActionToken_refundRequestId_purpose_idx" ON "RefundActionToken"("refundRequestId", "purpose");

-- CreateIndex
CREATE INDEX "RefundActionToken_expiresAt_idx" ON "RefundActionToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAttachment" ADD CONSTRAINT "RefundAttachment_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundMessage" ADD CONSTRAINT "RefundMessage_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundEvent" ADD CONSTRAINT "RefundEvent_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundNote" ADD CONSTRAINT "RefundNote_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundResolution" ADD CONSTRAINT "RefundResolution_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundActionToken" ADD CONSTRAINT "RefundActionToken_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─────────────────────────────────────────────────────────────────────────────
-- Legacy backfill: turn existing orders already marked "refunded" into labelled
-- legacy refund cases so the Refunds admin has a complete, auditable history.
-- Additive and idempotent (guarded by NOT EXISTS). Preserves original data and
-- timestamps; invents no transaction reference and no customer choice/reason.
-- These records carry legacy=true and are surfaced as
-- "Remboursement historique sans dossier détaillé".
-- ─────────────────────────────────────────────────────────────────────────────
WITH new_reqs AS (
  INSERT INTO "RefundRequest" (
    "id","orderId","customerId","customerName","customerEmail","customerPhone",
    "source","reason","description","requestedAmountMad","currency","status",
    "eligibilityDecision","legacy","createdAt","updatedAt","reviewedAt",
    "approvedAt","customerChoiceAt","processedAt","closedAt"
  )
  SELECT
    gen_random_uuid()::text, o."id", o."customerId", o."customerName", o."customerEmail",
    c."phone", 'ADMIN_CREATED', 'other',
    'Remboursement historique sans dossier détaillé (importé automatiquement lors de la mise en place du suivi des remboursements).',
    o."totalMad", 'MAD', 'REFUNDED', 'eligible', true,
    o."updatedAt", o."updatedAt", o."updatedAt", o."updatedAt", o."updatedAt", o."updatedAt", o."updatedAt"
  FROM "Order" o
  LEFT JOIN "Customer" c ON c."id" = o."customerId"
  WHERE o."status" = 'refunded'
    AND NOT EXISTS (SELECT 1 FROM "RefundRequest" r WHERE r."orderId" = o."id")
  RETURNING "id","orderId","requestedAmountMad","processedAt"
)
INSERT INTO "RefundResolution" (
  "id","refundRequestId","type","amountMad","currency","originalPaymentMethod",
  "selectedByCustomer","processingNote","processedByName","selectedAt","processedAt","createdAt","updatedAt"
)
SELECT
  gen_random_uuid()::text, nr."id", 'ORIGINAL_PAYMENT_METHOD', nr."requestedAmountMad",
  'MAD', o."paymentMethod", false,
  'Dossier historique importé automatiquement. Référence de transaction inconnue.',
  'Migration', nr."processedAt", nr."processedAt", nr."processedAt", nr."processedAt"
FROM new_reqs nr JOIN "Order" o ON o."id" = nr."orderId";

-- Timeline marker for each backfilled legacy case.
INSERT INTO "RefundEvent" ("id","refundRequestId","type","actorType","actorName","createdAt")
SELECT gen_random_uuid()::text, r."id", 'legacy_backfill', 'SYSTEM', 'Migration', r."createdAt"
FROM "RefundRequest" r
WHERE r."legacy" = true
  AND NOT EXISTS (SELECT 1 FROM "RefundEvent" e WHERE e."refundRequestId" = r."id" AND e."type" = 'legacy_backfill');
