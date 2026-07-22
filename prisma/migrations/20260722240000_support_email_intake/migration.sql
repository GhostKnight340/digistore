-- SupportTicket: email threading, source, internal notes, per-ticket AI lock.
ALTER TABLE "SupportTicket" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "SupportTicket" ADD COLUMN "emailMessageId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "emailReferences" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "lastOutboundEmailId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "internalNotes" JSONB;
ALTER TABLE "SupportTicket" ADD COLUMN "aiLockedAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "aiLockExpiresAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "aiLockedBy" TEXT;
CREATE INDEX "SupportTicket_emailMessageId_idx" ON "SupportTicket"("emailMessageId");

-- AiOpsSettings: support intake tuning.
ALTER TABLE "AiOpsSettings" ADD COLUMN "supportBatchingWindowSec" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "AiOpsSettings" ADD COLUMN "supportEmailFallbackDelaySec" INTEGER NOT NULL DEFAULT 300;

-- Inbound intake (durable delayed job).
CREATE TABLE "SupportEmailIntake" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT,
    "messageId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "references" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachments" JSONB,
    "orderRefGuess" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "ticketId" TEXT,
    "resultReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportEmailIntake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportEmailIntake_providerEventId_key" ON "SupportEmailIntake"("providerEventId");
CREATE UNIQUE INDEX "SupportEmailIntake_messageId_key" ON "SupportEmailIntake"("messageId");
CREATE INDEX "SupportEmailIntake_status_dueAt_idx" ON "SupportEmailIntake"("status", "dueAt");
CREATE INDEX "SupportEmailIntake_fromEmail_idx" ON "SupportEmailIntake"("fromEmail");
