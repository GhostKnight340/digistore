-- Admin Customer Management: account status, session-revocation anchor, admin
-- preferences, plus the audit-log and private customer-notes tables.
--
-- Purely ADDITIVE and safe against production:
--   * New Customer columns are nullable or carry a safe default ('active' /
--     false), so no existing row is rewritten with a blocking backfill and every
--     current account is 'active' by default (unchanged login/checkout behavior).
--   * `sessionsValidAfter` is NULL for all existing rows → existing session
--     cookies stay valid (revocation only applies once an admin sets it).
--   * New tables (AdminAuditLog, CustomerNote) start empty.
-- No customer-facing checkout/payment column is touched. No data is dropped.
--
-- Indexes added:
--   Customer_status_idx                      filter the client list by status
--   Customer_createdAt_idx                   sort/paginate by signup date
--   AdminAuditLog_customerId_createdAt_idx   per-customer activity/audit tab
--   AdminAuditLog_adminId_createdAt_idx      audit by acting admin
--   AdminAuditLog_action_idx                 audit filtering by action type
--   CustomerNote_customerId_createdAt_idx    a customer's notes, newest-first

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredLanguage" TEXT,
ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "customerId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "orderId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_customerId_createdAt_idx" ON "AdminAuditLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "CustomerNote_customerId_createdAt_idx" ON "CustomerNote"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
