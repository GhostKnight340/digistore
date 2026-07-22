CREATE TABLE "PaymentProofRevision" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProofRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProofRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "PaymentProofRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentProofRevision_orderId_uploadedAt_idx"
ON "PaymentProofRevision"("orderId", "uploadedAt");

CREATE UNIQUE INDEX "PaymentProofRequest_idempotencyKey_key"
ON "PaymentProofRequest"("idempotencyKey");

CREATE INDEX "PaymentProofRequest_orderId_createdAt_idx"
ON "PaymentProofRequest"("orderId", "createdAt");

CREATE INDEX "PaymentProofRequest_status_idx" ON "PaymentProofRequest"("status");

ALTER TABLE "PaymentProofRevision"
ADD CONSTRAINT "PaymentProofRevision_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentProofRequest"
ADD CONSTRAINT "PaymentProofRequest_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
