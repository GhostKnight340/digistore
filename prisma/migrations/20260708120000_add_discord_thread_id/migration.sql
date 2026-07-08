-- Adds per-order Discord card/thread tracking so #orders can host one
-- dashboard message per order (edited in place) with a thread holding the
-- full lifecycle timeline, instead of a flat event feed.
ALTER TABLE "Order" ADD COLUMN "discordMessageId" TEXT;
ALTER TABLE "Order" ADD COLUMN "discordThreadId" TEXT;
