-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "amount" DECIMAL(18,6),
    "isUsageBased" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL,
    "customIntervalDays" INTEGER,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "paymentAccount" TEXT,
    "notes" TEXT,
    "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "remindOnDue" BOOLEAN NOT NULL DEFAULT true,
    "remindOverdue" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL,
    "recurringExpenseId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountOriginal" DECIMAL(18,6),
    "currency" TEXT NOT NULL DEFAULT 'MAD',
    "amountEstimated" BOOLEAN NOT NULL DEFAULT false,
    "exchangeRateToMad" DECIMAL(18,8),
    "amountMad" DECIMAL(18,6),
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "dueDate" TIMESTAMP(3),
    "occurrenceDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,6),
    "paidCurrency" TEXT,
    "paidExchangeRate" DECIMAL(18,8),
    "paymentReference" TEXT,
    "paymentAccount" TEXT,
    "invoiceReference" TEXT,
    "receiptFileName" TEXT,
    "receiptMimeType" TEXT,
    "receiptData" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAdjustment" (
    "id" TEXT NOT NULL,
    "expenseEntryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'edit',
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseNotificationLog" (
    "id" TEXT NOT NULL,
    "recurringExpenseId" TEXT,
    "expenseEntryId" TEXT,
    "occurrenceDate" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'expenses',
    "discordMessageId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringExpense_status_nextBillingDate_idx" ON "RecurringExpense"("status", "nextBillingDate");

-- CreateIndex
CREATE INDEX "RecurringExpense_category_idx" ON "RecurringExpense"("category");

-- CreateIndex
CREATE INDEX "ExpenseEntry_status_idx" ON "ExpenseEntry"("status");

-- CreateIndex
CREATE INDEX "ExpenseEntry_category_idx" ON "ExpenseEntry"("category");

-- CreateIndex
CREATE INDEX "ExpenseEntry_dueDate_idx" ON "ExpenseEntry"("dueDate");

-- CreateIndex
CREATE INDEX "ExpenseEntry_recurringExpenseId_idx" ON "ExpenseEntry"("recurringExpenseId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_createdAt_idx" ON "ExpenseEntry"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseAdjustment_expenseEntryId_idx" ON "ExpenseAdjustment"("expenseEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseNotificationLog_dedupeKey_key" ON "ExpenseNotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "ExpenseNotificationLog_recurringExpenseId_idx" ON "ExpenseNotificationLog"("recurringExpenseId");

-- CreateIndex
CREATE INDEX "ExpenseNotificationLog_expenseEntryId_idx" ON "ExpenseNotificationLog"("expenseEntryId");

-- CreateIndex
CREATE INDEX "ExpenseNotificationLog_kind_createdAt_idx" ON "ExpenseNotificationLog"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAdjustment" ADD CONSTRAINT "ExpenseAdjustment_expenseEntryId_fkey" FOREIGN KEY ("expenseEntryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseNotificationLog" ADD CONSTRAINT "ExpenseNotificationLog_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseNotificationLog" ADD CONSTRAINT "ExpenseNotificationLog_expenseEntryId_fkey" FOREIGN KEY ("expenseEntryId") REFERENCES "ExpenseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

