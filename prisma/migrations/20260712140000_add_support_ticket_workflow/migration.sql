-- Extends SupportTicket for the full support workflow: admin replies, an
-- optional close resolution, a Discord card/thread per ticket, and post-close
-- customer feedback (rating + comment gated by a random token).
ALTER TABLE "SupportTicket" ADD COLUMN "resolution" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "replies" JSONB;
ALTER TABLE "SupportTicket" ADD COLUMN "discordMessageId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "discordThreadId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "feedbackToken" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "feedbackRating" INTEGER;
ALTER TABLE "SupportTicket" ADD COLUMN "feedbackComment" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "feedbackAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_feedbackToken_key" ON "SupportTicket"("feedbackToken");
