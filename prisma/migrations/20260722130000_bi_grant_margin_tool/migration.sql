-- Business Intelligence now uses the getMarginSummary safe tool for weekly
-- gross-margin analysis. New installs get the grant from DEFAULT_TOOL_GRANTS on
-- seed; this backfills the grant onto an already-seeded business_intelligence
-- row. Additive + idempotent; a no-op if the module row does not exist yet.
INSERT INTO "AiModulePermission" ("id", "module", "tool", "createdAt")
SELECT gen_random_uuid()::text, 'business_intelligence', 'getMarginSummary', now()
WHERE EXISTS (SELECT 1 FROM "AiModuleConfig" WHERE "module" = 'business_intelligence')
ON CONFLICT ("module", "tool") DO NOTHING;
