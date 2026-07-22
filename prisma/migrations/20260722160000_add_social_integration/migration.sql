-- Composio Instagram integration.
-- Additive + re-runnable: uses IF NOT EXISTS guards so it is safe to apply on an
-- environment that already has the tables (mirrors the AI-operations migrations).
-- No OAuth tokens or provider secrets are stored — Composio manages credentials;
-- these tables hold only the connected-account id and safe metadata.

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialIntegration" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "composioUserId" TEXT,
    "connectedAccountId" TEXT,
    "authConfigId" TEXT,
    "accountId" TEXT,
    "username" TEXT,
    "profileName" TEXT,
    "profilePictureUrl" TEXT,
    "accountType" TEXT,
    "facebookPageId" TEXT,
    "facebookPageName" TEXT,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "InstagramActionRecord" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetId" TEXT,
    "resultId" TEXT,
    "caption" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramActionRecord_pkey" PRIMARY KEY ("id")
);

-- Keep the migration re-runnable when an earlier draft of the table exists.
ALTER TABLE "InstagramActionRecord"
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SocialIntegration_provider_key" ON "SocialIntegration"("provider");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialIntegration_provider_idx" ON "SocialIntegration"("provider");
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InstagramActionRecord_idempotencyKey_key" ON "InstagramActionRecord"("idempotencyKey");
-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstagramActionRecord_kind_createdAt_idx" ON "InstagramActionRecord"("kind", "createdAt");
