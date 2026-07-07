CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "customerNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "logoUrl" TEXT,
    "initials" TEXT NOT NULL DEFAULT '',
    "accentColor" TEXT NOT NULL DEFAULT '#3e7bfa',
    "logoType" TEXT NOT NULL DEFAULT 'initials',
    "details" JSONB NOT NULL DEFAULT '{}',
    "proofRequired" BOOLEAN NOT NULL DEFAULT true,
    "internalNote" TEXT NOT NULL DEFAULT '',
    "minAmount" DOUBLE PRECISION,
    "maxAmount" DOUBLE PRECISION,
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentMethod_sortOrder_idx" ON "PaymentMethod"("sortOrder");
