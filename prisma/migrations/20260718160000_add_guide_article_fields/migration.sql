-- Guides: article-template fields from the Activation Guides design handoff.
--
-- SAFE BY DESIGN: purely additive. Every column is nullable or has a default,
-- so existing guides are untouched and keep rendering.
--
-- All of these are ADMIN-AUTHORED on purpose — nothing is inferred. The article
-- renders a meta chip only when its field is actually filled in, so an
-- un-authored guide shows no difficulty/region/device chip rather than a
-- fabricated one. `durationMinutes` is the only override: when null the article
-- falls back to the derived "≈ N min" reading estimate.

-- AlterTable
ALTER TABLE "Guide" ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "officialUrl" TEXT,
ADD COLUMN     "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "steps" JSONB,
ADD COLUMN     "supportedDevices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "supportedRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "troubleshooting" JSONB,
ADD COLUMN     "vendor" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT NOT NULL DEFAULT '';
