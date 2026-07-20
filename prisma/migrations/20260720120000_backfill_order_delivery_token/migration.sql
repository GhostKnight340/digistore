-- Backfill an unguessable delivery/access token for every existing order that
-- lacks one. Customer-facing order URLs now use this token instead of the
-- enumerable sequential public number, so in-flight (pre-token) orders need a
-- token to remain reachable by their guest owners via the "find my order" flow.
-- random() makes the value unguessable; concatenating the unique id guarantees
-- no collision under the UNIQUE constraint.
UPDATE "Order"
SET "deliveryToken" = md5(random()::text || clock_timestamp()::text || id)
WHERE "deliveryToken" IS NULL;
