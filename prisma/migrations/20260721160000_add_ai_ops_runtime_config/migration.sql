-- AlterTable: tunable runtime knobs for AI Operations (spec §10)
ALTER TABLE "AiOpsSettings"
  ADD COLUMN "conversationTtlMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "conversationMessageLimit" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "maxToolRounds" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "maxToolCallsPerExecution" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "providerTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
  ADD COLUMN "providerMaxRetries" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "userRateLimitPerMin" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "globalRateLimitPerMin" INTEGER NOT NULL DEFAULT 240;
