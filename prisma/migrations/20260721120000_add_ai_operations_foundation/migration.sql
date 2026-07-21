-- AI Operations foundation — the shared infrastructure for the controlled AI
-- modules (Discord Business Assistant, Support Assistant, Daily Reports,
-- Supplier/Meta-Ads/Business Intelligence, Marketing Assistant).
--
-- Strictly ADDITIVE: nine new tables, nothing dropped, renamed, retyped or
-- backfilled. No provider secret is ever stored here — API keys live in env
-- (see src/lib/ai-ops/config.ts), like DISCORD_BOT_TOKEN and CRON_SECRET.
--
-- Every statement is IF NOT EXISTS / constraint-guarded (matching the style of
-- 20260719120000_add_ops_job_runs_alert_cooldowns_purchase_marker and
-- 20260720170000_add_admin_email_composer), so the migration is safe to re-run
-- and safe to apply to a database that already has part of it applied.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiOpsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "globalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Casablanca',
    "reportLanguage" TEXT NOT NULL DEFAULT 'fr',
    "defaultProvider" TEXT NOT NULL DEFAULT 'mock',
    "defaultModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "monthlyBudgetUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "warningThresholdUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hardLimitUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discordGuildId" TEXT,
    "defaultReportChannelId" TEXT,
    "defaultAlertChannelId" TEXT,
    "defaultApprovalChannelId" TEXT,
    "logRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "redactSensitive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOpsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiModuleConfig" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "executionMode" TEXT NOT NULL,
    "providerOverride" TEXT,
    "modelOverride" TEXT,
    "discordChannelId" TEXT,
    "schedule" TEXT,
    "maxExecutionsPerDay" INTEGER NOT NULL DEFAULT 24,
    "maxDailyCostUsd" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "instructions" TEXT NOT NULL DEFAULT '',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiModulePermission" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiScheduledJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "lastIdempotencyKey" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiExecution" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "idempotencyKey" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "estimatedTokensIn" INTEGER,
    "estimatedTokensOut" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "summary" TEXT,
    "error" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiToolCallLog" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "module" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiApproval" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "proposedContent" TEXT NOT NULL,
    "editedContent" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "executionResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiUsageRecord" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "executionId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiDiscordChannelMapping" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDiscordChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiModuleConfig_module_key" ON "AiModuleConfig"("module");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiModuleConfig_enabled_idx" ON "AiModuleConfig"("enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiModulePermission_module_idx" ON "AiModulePermission"("module");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiModulePermission_module_tool_key" ON "AiModulePermission"("module", "tool");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiScheduledJob_key_key" ON "AiScheduledJob"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiScheduledJob_enabled_status_idx" ON "AiScheduledJob"("enabled", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiExecution_idempotencyKey_key" ON "AiExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiExecution_module_createdAt_idx" ON "AiExecution"("module", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiExecution_status_createdAt_idx" ON "AiExecution"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiToolCallLog_module_createdAt_idx" ON "AiToolCallLog"("module", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiToolCallLog_tool_createdAt_idx" ON "AiToolCallLog"("tool", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiToolCallLog_status_createdAt_idx" ON "AiToolCallLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiApproval_module_status_idx" ON "AiApproval"("module", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiApproval_status_createdAt_idx" ON "AiApproval"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageRecord_module_createdAt_idx" ON "AiUsageRecord"("module", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageRecord_createdAt_idx" ON "AiUsageRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiDiscordChannelMapping_purpose_key" ON "AiDiscordChannelMapping"("purpose");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiModulePermission_module_fkey') THEN
    ALTER TABLE "AiModulePermission" ADD CONSTRAINT "AiModulePermission_module_fkey" FOREIGN KEY ("module") REFERENCES "AiModuleConfig"("module") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiToolCallLog_executionId_fkey') THEN
    ALTER TABLE "AiToolCallLog" ADD CONSTRAINT "AiToolCallLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AiExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

