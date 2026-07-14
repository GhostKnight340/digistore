-- Ghost Credit: wallet-wide 60-day inactivity expiry + spend-at-checkout.
--
-- Purely additive. "Customer"."ghostCreditExpiresAt" is the wallet-wide expiry
-- deadline (reset to now + 60 days on every credit grant; null when empty).
-- "Order"."ghostCreditAppliedMad" records credit spent on an order. Both are
-- nullable / defaulted, so every existing row is untouched.

ALTER TABLE "Customer" ADD COLUMN "ghostCreditExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "ghostCreditAppliedMad" INTEGER NOT NULL DEFAULT 0;
