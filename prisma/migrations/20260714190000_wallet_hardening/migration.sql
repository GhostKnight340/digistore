-- Wallet hardening: DB-level financial integrity constraints + freeze fields.
--
-- Additive. The two Customer columns default safely (no wallet is frozen). The
-- CHECK constraints codify invariants the application already upholds, so they
-- validate against existing rows without change:
--   * every ledger entry moves a strictly positive amount (no zero-value rows),
--   * direction is exactly 'credit' or 'debit'.
-- These make silent corruption impossible at the database layer, independent of
-- application code. Idempotency remains enforced by the existing UNIQUE index on
-- GhostCreditTransaction.idempotencyKey.

ALTER TABLE "Customer" ADD COLUMN "walletFrozen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "walletFrozenReason" TEXT;

ALTER TABLE "GhostCreditTransaction"
  ADD CONSTRAINT "GhostCreditTransaction_amount_positive" CHECK ("amountMad" > 0);

ALTER TABLE "GhostCreditTransaction"
  ADD CONSTRAINT "GhostCreditTransaction_direction_valid" CHECK ("direction" IN ('credit', 'debit'));
