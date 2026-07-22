ALTER TABLE "SupportCoverageSession" ADD COLUMN "handoff" JSONB;
ALTER TABLE "SupportCoverageSession" ADD COLUMN "consecutiveLowConfidence" INTEGER NOT NULL DEFAULT 0;
