-- Replace the unused singleton coverage flag with a durable session model.
DROP TABLE IF EXISTS "AiSupportCoverage";

-- CreateTable
CREATE TABLE "SupportCoverageSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "activatedBy" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "channels" TEXT[],
    "languages" TEXT[],
    "categories" TEXT[],
    "automationMode" TEXT NOT NULL DEFAULT 'draft_only',
    "draftOnly" BOOLEAN NOT NULL DEFAULT true,
    "allowAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" TEXT NOT NULL DEFAULT 'high',
    "notifyMode" TEXT NOT NULL DEFAULT 'approvals_and_urgent',
    "escalationBehavior" TEXT NOT NULL DEFAULT 'notify',
    "fallbackMessage" TEXT,
    "casesProcessed" INTEGER NOT NULL DEFAULT 0,
    "messagesDrafted" INTEGER NOT NULL DEFAULT 0,
    "messagesAutoSent" INTEGER NOT NULL DEFAULT 0,
    "escalationsCreated" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "pauseReason" TEXT,
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCoverageSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportCoverageSession_state_idx" ON "SupportCoverageSession"("state");
CREATE INDEX "SupportCoverageSession_activatedAt_idx" ON "SupportCoverageSession"("activatedAt");
