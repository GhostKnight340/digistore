-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "terminatedAt" TIMESTAMP(3),
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "terminationType" TEXT;

