-- Run only after `scripts/backfill-payment-methods.ts` has been executed and
-- verified against the target database — it copies every Bank / CryptoWallet /
-- PaymentMethodConfig row into "PaymentMethod" before this migration deletes them.
DROP TABLE "Bank";
DROP TABLE "CryptoWallet";
DROP TABLE "PaymentMethodConfig";
