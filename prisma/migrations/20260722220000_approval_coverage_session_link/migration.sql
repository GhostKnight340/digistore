ALTER TABLE "AiApproval" ADD COLUMN "coverageSessionId" TEXT;
CREATE INDEX "AiApproval_coverageSessionId_idx" ON "AiApproval"("coverageSessionId");
