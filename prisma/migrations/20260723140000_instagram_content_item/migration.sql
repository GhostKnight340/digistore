-- Instagram Content Studio: one row spans draft → queue → publication.
CREATE TABLE "InstagramContentItem" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'post',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media" JSONB NOT NULL DEFAULT '[]',
    "reelCoverIndex" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "timezone" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "instagramMediaId" TEXT,
    "instagramPermalink" TEXT,
    "idempotencyKey" TEXT,
    "accountId" TEXT,
    "createdByAdminId" TEXT,
    "createdByAdminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstagramContentItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramContentItem_idempotencyKey_key" ON "InstagramContentItem"("idempotencyKey");
CREATE INDEX "InstagramContentItem_status_scheduledFor_idx" ON "InstagramContentItem"("status", "scheduledFor");
CREATE INDEX "InstagramContentItem_status_createdAt_idx" ON "InstagramContentItem"("status", "createdAt");
