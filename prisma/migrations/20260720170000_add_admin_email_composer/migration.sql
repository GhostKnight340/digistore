-- Admin Email Composer: admin-composed transactional / customer-care e-mails with
-- a modular, typed body, reusing the existing Ghost Credit ledger for any credit
-- granted from an email.
--
-- Strictly ADDITIVE. Nothing is dropped, renamed, retyped or backfilled:
--   • Customer gains one array column with an empty default (existing admins keep
--     full access — see src/lib/admin/permissions.ts).
--   • GhostCreditTransaction gains one nullable column + index linking a credit
--     row to the send that granted it (no behavior change to existing rows).
--   • Two new tables hold the sends and their per-recipient results.
--
-- Every statement is IF NOT EXISTS-guarded (matching the style of
-- 20260719120000_add_ops_job_runs_alert_cooldowns_purchase_marker), so this
-- migration is safe to re-run and safe to apply to a database that already has
-- part of it. The previous release keeps serving traffic unchanged while it is
-- applied; rolling back simply leaves the new tables and columns unused.

-- ── Customer: granular admin permissions ───────────────────────────────────
-- Empty default is deliberate and backward-compatible: an ADMIN with no explicit
-- permissions keeps full access; a restricted admin gets an explicit subset.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "adminPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── GhostCreditTransaction: link a credit row to the email send ────────────
ALTER TABLE "GhostCreditTransaction" ADD COLUMN IF NOT EXISTS "emailSendId" TEXT;
CREATE INDEX IF NOT EXISTS "GhostCreditTransaction_emailSendId_idx" ON "GhostCreditTransaction"("emailSendId");

-- ── AdminEmailSend ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AdminEmailSend" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recipientMode" TEXT NOT NULL DEFAULT 'existing',
    "templateKey" TEXT NOT NULL DEFAULT 'custom',
    "subject" TEXT NOT NULL DEFAULT '',
    "preheader" TEXT NOT NULL DEFAULT '',
    "eyebrow" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "modules" JSONB NOT NULL DEFAULT '[]',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "testRecipient" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "creditGrantedMad" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT NOT NULL,
    "createdByAdminName" TEXT NOT NULL,
    "requestMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "AdminEmailSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminEmailSend_status_createdAt_idx" ON "AdminEmailSend"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminEmailSend_createdByAdminId_createdAt_idx" ON "AdminEmailSend"("createdByAdminId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminEmailSend_isTest_idx" ON "AdminEmailSend"("isTest");

-- ── AdminEmailRecipient ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AdminEmailRecipient" (
    "id" TEXT NOT NULL,
    "sendId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "renderedSubject" TEXT NOT NULL DEFAULT '',
    "renderedHtml" TEXT NOT NULL DEFAULT '',
    "renderedText" TEXT NOT NULL DEFAULT '',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "emailLogId" TEXT,
    "creditAmountMad" INTEGER NOT NULL DEFAULT 0,
    "creditStatus" TEXT NOT NULL DEFAULT 'none',
    "creditTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminEmailRecipient_sendId_email_key" ON "AdminEmailRecipient"("sendId", "email");
CREATE INDEX IF NOT EXISTS "AdminEmailRecipient_sendId_status_idx" ON "AdminEmailRecipient"("sendId", "status");
CREATE INDEX IF NOT EXISTS "AdminEmailRecipient_customerId_idx" ON "AdminEmailRecipient"("customerId");

-- ── Foreign keys (guarded: added only when absent) ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GhostCreditTransaction_emailSendId_fkey'
  ) THEN
    ALTER TABLE "GhostCreditTransaction"
      ADD CONSTRAINT "GhostCreditTransaction_emailSendId_fkey"
      FOREIGN KEY ("emailSendId") REFERENCES "AdminEmailSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminEmailRecipient_sendId_fkey'
  ) THEN
    ALTER TABLE "AdminEmailRecipient"
      ADD CONSTRAINT "AdminEmailRecipient_sendId_fkey"
      FOREIGN KEY ("sendId") REFERENCES "AdminEmailSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminEmailRecipient_customerId_fkey'
  ) THEN
    ALTER TABLE "AdminEmailRecipient"
      ADD CONSTRAINT "AdminEmailRecipient_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
