-- CreateTable
CREATE TABLE "ExpenseMonthlyReview" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "discordMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseMonthlyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseMonthlyReview_monthKey_key" ON "ExpenseMonthlyReview"("monthKey");

-- CreateIndex
CREATE INDEX "ExpenseMonthlyReview_monthKey_idx" ON "ExpenseMonthlyReview"("monthKey");
