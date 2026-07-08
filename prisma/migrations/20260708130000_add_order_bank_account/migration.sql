-- Bank transfer UX refactor: new bank orders store the generic literal
-- "BANK_TRANSFER" in "paymentMethod" and record the specific bank account the
-- customer selected on the payment page here. Nullable so existing orders
-- (which encode the bank in "paymentMethod") are untouched and remain readable.
ALTER TABLE "Order" ADD COLUMN "bankAccountId" TEXT;
