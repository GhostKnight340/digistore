-- Lower the tool-call budget defaults to stretch free-tier request quotas.
ALTER TABLE "AiOpsSettings" ALTER COLUMN "maxToolRounds" SET DEFAULT 3;
ALTER TABLE "AiOpsSettings" ALTER COLUMN "maxToolCallsPerExecution" SET DEFAULT 5;

-- Apply to existing rows ONLY where the value is still the old default
-- (never clobber a value an admin has customized).
UPDATE "AiOpsSettings" SET "maxToolRounds" = 3 WHERE "maxToolRounds" = 4;
UPDATE "AiOpsSettings" SET "maxToolCallsPerExecution" = 5 WHERE "maxToolCallsPerExecution" = 8;
