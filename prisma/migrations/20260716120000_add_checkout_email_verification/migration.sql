-- Inline checkout email verification: prove control of an email BEFORE any
-- account exists, so anonymous guest checkout can be removed.
--
-- Purely ADDITIVE and safe against production: one brand-new table, no change to
-- any existing table or column, no data touched. The six-digit code is stored
-- only as an HMAC ("codeHash") — never in plaintext and never returned by an API.
-- Rows are bound to the normalized email AND the browser checkout-session id so
-- a code is useless outside the session that requested it. Indexes back the
-- active-row lookup (email + sessionId) and the expiry cleanup (expiresAt).

-- CreateTable
CREATE TABLE "CheckoutEmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutEmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckoutEmailVerification_email_sessionId_idx" ON "CheckoutEmailVerification"("email", "sessionId");

-- CreateIndex
CREATE INDEX "CheckoutEmailVerification_expiresAt_idx" ON "CheckoutEmailVerification"("expiresAt");
