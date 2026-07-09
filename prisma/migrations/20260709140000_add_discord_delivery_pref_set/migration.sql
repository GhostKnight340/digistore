-- Tracks whether the customer has explicitly set a per-order Discord delivery
-- choice yet, so the payment page can seed the checkbox from the customer's
-- global default exactly once without later reverting an explicit per-order
-- choice.
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "discordDeliveryPreferenceSet" BOOLEAN NOT NULL DEFAULT false;
