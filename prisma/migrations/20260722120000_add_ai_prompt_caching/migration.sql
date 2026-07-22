-- Anthropic prompt caching (see src/lib/ai-ops/caching.ts).
-- Additive + idempotent: new columns with safe defaults, no data rewrite.

-- AlterTable: per-module caching configuration.
ALTER TABLE "AiModuleConfig" ADD COLUMN IF NOT EXISTS "promptCachingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AiModuleConfig" ADD COLUMN IF NOT EXISTS "promptCachingStrategy" TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE "AiModuleConfig" ADD COLUMN IF NOT EXISTS "promptCacheTtl" TEXT NOT NULL DEFAULT '5m';

-- Scheduled / highly-dynamic modules build a stable system prefix followed by a
-- volatile suffix (live figures, timestamps), so they cache the prefix explicitly
-- rather than auto-caching the changing tail. Conversational modules keep the
-- 'automatic' default. 1-hour TTL is never seeded on (5m only).
UPDATE "AiModuleConfig"
   SET "promptCachingStrategy" = 'explicit_static_prefix'
 WHERE "module" IN ('daily_reports', 'supplier_intelligence', 'business_intelligence', 'meta_ads_intelligence');

-- AlterTable: per-call prompt-caching accounting.
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheHit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheStrategy" TEXT;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheTtl" TEXT;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "cacheFallbackReason" TEXT;
ALTER TABLE "AiUsageRecord" ADD COLUMN IF NOT EXISTS "costWithoutCacheUsd" DECIMAL(12,6);
