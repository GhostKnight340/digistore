-- Daily Reports module — per-report schedule + scheduler state.
--
-- One row per executive report type (morning / evening / weekly / monthly), all
-- belonging to the single `daily_reports` AI module. Holds both the admin
-- configuration and the scheduler state (idempotency + cross-deployment lock +
-- last-run tracking), specializing the AiScheduledJob pattern for the 4
-- independently-configurable reports.
--
-- Strictly ADDITIVE: one new table, nothing dropped, renamed, retyped or
-- backfilled. No provider secret is ever stored here. Every statement is
-- IF NOT EXISTS / guarded so the migration is safe to re-run and safe to apply
-- to a database that already has part of it applied (matching the style of
-- 20260721120000_add_ai_operations_foundation).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiReportSchedule" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule" TEXT NOT NULL,
    "timezone" TEXT,
    "discordChannelId" TEXT,
    "modelOverride" TEXT,
    "maxTokens" INTEGER,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
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

    CONSTRAINT "AiReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiReportSchedule_reportType_key" ON "AiReportSchedule"("reportType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiReportSchedule_enabled_idx" ON "AiReportSchedule"("enabled");
