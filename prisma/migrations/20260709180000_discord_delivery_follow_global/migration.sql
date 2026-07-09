-- `discordDeliveryPreferenceSet` now means "the customer explicitly toggled the
-- per-order Discord choice." Previously it was also set when the payment page
-- merely auto-seeded the checkbox from the global default, which wrongly locked
-- those orders out of later global-preference changes.
--
-- Clear the flag on orders that have not had a real DM send yet, so they follow
-- the customer's current global preference (discordOrderDeliveryEnabled) again.
-- Orders already SENT/FAILED are past the decision point and left untouched.
UPDATE "Order"
SET "discordDeliveryPreferenceSet" = false
WHERE "discordDeliveryStatus" NOT IN ('SENT', 'FAILED');
