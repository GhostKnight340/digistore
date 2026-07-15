-- Feedback & Suggestions system: submissions, attachments, private notes, and an
-- append-only activity trail. Kept deliberately separate from the support queue.
--
-- Purely ADDITIVE and safe against production: four brand-new tables, no change
-- to any existing table or column, no data touched. `seq` is a SERIAL so the
-- human-readable reference (FB-000123) is race-free without a second write. All
-- indexes back the admin list filters (status/type/priority/date/customer) and
-- the rate-limit/dup lookup (ipHash+createdAt). `ipHash` stores only a salted
-- hash of the submitter IP for spam control — never a raw IP.

-- CreateTable
CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "customerId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "contactAllowed" BOOLEAN NOT NULL DEFAULT false,
    "relatedUrl" TEXT,
    "relatedRoute" TEXT,
    "pageTitle" TEXT,
    "deviceType" TEXT,
    "viewport" TEXT,
    "browserSummary" TEXT,
    "deploymentVersion" TEXT,
    "ipHash" TEXT,
    "assignedAdminId" TEXT,
    "assignedAdminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackActivity" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackSubmission_seq_key" ON "FeedbackSubmission"("seq");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_status_idx" ON "FeedbackSubmission"("status");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_type_idx" ON "FeedbackSubmission"("type");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_priority_idx" ON "FeedbackSubmission"("priority");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_customerId_idx" ON "FeedbackSubmission"("customerId");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_createdAt_idx" ON "FeedbackSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_ipHash_createdAt_idx" ON "FeedbackSubmission"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_submissionId_idx" ON "FeedbackAttachment"("submissionId");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_createdAt_idx" ON "FeedbackAttachment"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackNote_submissionId_createdAt_idx" ON "FeedbackNote"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackActivity_submissionId_createdAt_idx" ON "FeedbackActivity"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackActivity" ADD CONSTRAINT "FeedbackActivity_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
