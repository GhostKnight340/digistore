ALTER TABLE "SupportEmailIntake" ADD COLUMN "originalSender" TEXT;
ALTER TABLE "SupportEmailIntake" ADD COLUMN "senderSource" TEXT;
ALTER TABLE "SupportEmailIntake" ADD COLUMN "senderConfidence" TEXT;
ALTER TABLE "SupportEmailIntake" ADD COLUMN "rawHeaders" JSONB;
