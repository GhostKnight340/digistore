-- Add auto-incrementing orderNumber to Order, starting at 1000.
-- Existing rows (if any) get numbers assigned from the sequence.

CREATE SEQUENCE "Order_orderNumber_seq" START 1000;

ALTER TABLE "Order"
  ADD COLUMN "orderNumber" INTEGER NOT NULL DEFAULT nextval('"Order_orderNumber_seq"');

ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
