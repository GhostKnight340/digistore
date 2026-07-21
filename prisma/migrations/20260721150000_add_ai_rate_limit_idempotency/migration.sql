-- CreateTable
CREATE TABLE "AiRateCounter" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRateCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiIdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "result" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiRateCounter_bucket_key" ON "AiRateCounter"("bucket");

-- CreateIndex
CREATE INDEX "AiRateCounter_expiresAt_idx" ON "AiRateCounter"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiIdempotencyKey_key_key" ON "AiIdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "AiIdempotencyKey_expiresAt_idx" ON "AiIdempotencyKey"("expiresAt");
