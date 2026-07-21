-- AI Operations budget guardrails — sensible non-zero defaults.
--
-- The subsystem shipped with all budget ceilings at 0 ("no limit"), so spend was
-- uncapped once a real (paid) provider was configured. This sets default caps so
-- a fresh install is protected by construction, and backfills the existing
-- singleton settings row ONLY when the admin has not configured any budget yet
-- (all three still 0) — an intentional admin choice is never overwritten.
--
-- Numbers (USD/month): warn at 15, block new runs past 25 (the binding ceiling),
-- hard backstop 30. Comfortable headroom over the estimated ~$2–12/mo suite cost
-- on Haiku; adjustable anytime in AI Operations → Réglages.
--
-- Strictly ADDITIVE: no table/column added or dropped, only column DEFAULTs and a
-- guarded data backfill. Safe to re-run.

-- Column defaults for fresh installs.
ALTER TABLE "AiOpsSettings" ALTER COLUMN "monthlyBudgetUsd" SET DEFAULT 25;
ALTER TABLE "AiOpsSettings" ALTER COLUMN "warningThresholdUsd" SET DEFAULT 15;
ALTER TABLE "AiOpsSettings" ALTER COLUMN "hardLimitUsd" SET DEFAULT 30;

-- Backfill the singleton row only when no budget has been configured yet.
UPDATE "AiOpsSettings"
SET "warningThresholdUsd" = 15,
    "monthlyBudgetUsd" = 25,
    "hardLimitUsd" = 30
WHERE "monthlyBudgetUsd" = 0
  AND "warningThresholdUsd" = 0
  AND "hardLimitUsd" = 0;
