-- Ghost Credit: qualifying-only 180-day expiry + configurable spending milestones.
--
-- Purely additive. New Customer wallet fields (all nullable / safe defaults), new
-- ledger columns (resetsExpiration defaults false; milestone/audit fields
-- nullable), and two new tables. No existing row is altered. The CHECK on
-- SpendingMilestone keeps thresholds/rewards strictly positive.

-- AlterTable: Customer wallet expiry/reminder fields
ALTER TABLE "Customer" ADD COLUMN "lastQualifyingCreditEarnedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "expirationReminderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "expirationReminderSentFor" TIMESTAMP(3);

-- AlterTable: ledger — qualifying flag + milestone/audit context
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "resetsExpiration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "milestoneId" TEXT;
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "thresholdMad" INTEGER;
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "qualifyingSpendMad" INTEGER;
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "relatedTransactionId" TEXT;
ALTER TABLE "GhostCreditTransaction" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "SpendingMilestone" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "publicTitle" TEXT NOT NULL,
    "publicDescription" TEXT NOT NULL DEFAULT '',
    "thresholdMad" INTEGER NOT NULL,
    "rewardMad" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendingMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingMilestoneGrant" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "thresholdMad" INTEGER NOT NULL,
    "rewardMad" INTEGER NOT NULL,
    "qualifyingSpendMad" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendingMilestoneGrant_pkey" PRIMARY KEY ("id")
);

-- Integrity: milestones must be strictly positive.
ALTER TABLE "SpendingMilestone"
  ADD CONSTRAINT "SpendingMilestone_positive" CHECK ("thresholdMad" > 0 AND "rewardMad" > 0);

-- CreateIndex
CREATE INDEX "GhostCreditTransaction_milestoneId_idx" ON "GhostCreditTransaction"("milestoneId");
CREATE INDEX "SpendingMilestone_active_displayOrder_idx" ON "SpendingMilestone"("active", "displayOrder");
CREATE INDEX "SpendingMilestone_archivedAt_idx" ON "SpendingMilestone"("archivedAt");
CREATE INDEX "SpendingMilestone_thresholdMad_idx" ON "SpendingMilestone"("thresholdMad");
CREATE UNIQUE INDEX "SpendingMilestoneGrant_milestoneId_customerId_key" ON "SpendingMilestoneGrant"("milestoneId", "customerId");
CREATE INDEX "SpendingMilestoneGrant_customerId_status_idx" ON "SpendingMilestoneGrant"("customerId", "status");
CREATE INDEX "SpendingMilestoneGrant_milestoneId_idx" ON "SpendingMilestoneGrant"("milestoneId");
CREATE INDEX "SpendingMilestoneGrant_orderId_idx" ON "SpendingMilestoneGrant"("orderId");

-- AddForeignKey
ALTER TABLE "GhostCreditTransaction" ADD CONSTRAINT "GhostCreditTransaction_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "SpendingMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpendingMilestoneGrant" ADD CONSTRAINT "SpendingMilestoneGrant_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "SpendingMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpendingMilestoneGrant" ADD CONSTRAINT "SpendingMilestoneGrant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendingMilestoneGrant" ADD CONSTRAINT "SpendingMilestoneGrant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
