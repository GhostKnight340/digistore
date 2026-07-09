-- Discord as an optional auth-link identity and order DM-delivery channel.
-- Two distinct concerns kept separate on Customer:
--   * discordId + discordUsername/GlobalName/Avatar  -> OAuth identity (login/link)
--   * discordDmUserId + ...                           -> VERIFIED DM recipient, set
--     only by the DM worker after a valid activation code is received.
-- All additions are nullable / defaulted: no data loss, fully backward compatible.
ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "discordId" TEXT,
ADD COLUMN IF NOT EXISTS "discordUsername" TEXT,
ADD COLUMN IF NOT EXISTS "discordGlobalName" TEXT,
ADD COLUMN IF NOT EXISTS "discordAvatar" TEXT,
ADD COLUMN IF NOT EXISTS "discordDmUserId" TEXT,
ADD COLUMN IF NOT EXISTS "discordDmUsername" TEXT,
ADD COLUMN IF NOT EXISTS "discordDmDisplayName" TEXT,
ADD COLUMN IF NOT EXISTS "discordDmAvatar" TEXT,
ADD COLUMN IF NOT EXISTS "discordDmActivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "discordDmActivatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "discordOrderDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_discordId_key" ON "Customer"("discordId");

-- Per-order Discord DM delivery state. Additive convenience channel only; never
-- gates whether the order is delivered.
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "discordDeliveryRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "discordDeliveryStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN IF NOT EXISTS "discordDeliveryAttemptedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "discordDeliverySentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "discordDeliveryError" TEXT;

-- One-time DM activation codes (hash only). Single-use, short-lived; superseded
-- codes are invalidated in application code on regeneration.
CREATE TABLE IF NOT EXISTS "DiscordActivationCode" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordActivationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiscordActivationCode_codeHash_key" ON "DiscordActivationCode"("codeHash");
CREATE INDEX IF NOT EXISTS "DiscordActivationCode_customerId_idx" ON "DiscordActivationCode"("customerId");
CREATE INDEX IF NOT EXISTS "DiscordActivationCode_expiresAt_idx" ON "DiscordActivationCode"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiscordActivationCode_customerId_fkey'
  ) THEN
    ALTER TABLE "DiscordActivationCode"
      ADD CONSTRAINT "DiscordActivationCode_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
