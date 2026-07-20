-- Operations + analytics durability: scheduled-job execution state, durable
-- alert cooldowns, and an exactly-once marker for the GA4 purchase event.
--
-- Strictly ADDITIVE. Nothing is dropped, renamed, retyped or backfilled. The one
-- new column on an existing table is nullable with no default, so every existing
-- Order row is untouched and the previous release keeps serving traffic
-- unchanged while this is applied. Rolling back = the new tables and column
-- simply go unused.
--
-- Hand-authored rather than generated: `prisma migrate dev` cannot run against
-- this database because of pre-existing drift (two historical migrations were
-- edited after being applied, and DeliveredCode carries a unique index absent
-- from migration history), and it responds by offering to RESET the database.
-- Every statement below is therefore IF NOT EXISTS-guarded, matching the style
-- of 20260718180000_add_supplier_fulfillment_ledger, so this migration is safe
-- to re-run and safe to apply to a database that already has part of it.

-- ── Order: GA4 purchase-event exactly-once marker ──────────────────────────
-- Set the first time the server-side `purchase` event is sent. A conditional
-- update on this column turns exactly-once from an emergent property (GA4
-- collapsing on transaction_id + an atomic delivery transition) into an
-- invariant the database enforces.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "analyticsPurchaseSentAt" TIMESTAMP(3);

-- ── Scheduled job execution state ──────────────────────────────────────────
-- One row per job, upserted on each run — NOT one row per execution, so the
-- table stays permanently bounded (5 rows today) with no retention job.
CREATE TABLE IF NOT EXISTS "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- The upsert key: one row per job name, enforced by the database rather than by
-- application logic.
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledJobRun_job_key" ON "ScheduledJobRun"("job");
CREATE INDEX IF NOT EXISTS "ScheduledJobRun_status_updatedAt_idx"
    ON "ScheduledJobRun"("status", "updatedAt");

-- ── Durable alert cooldowns ────────────────────────────────────────────────
-- Replaces the per-process in-memory Map in src/lib/discord/supplierAlerts.ts,
-- which resets on every serverless cold start — so a persistently failing
-- integration re-alerts indefinitely instead of staying muted.
CREATE TABLE IF NOT EXISTS "AlertCooldown" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "lastFiredAt" TIMESTAMP(3) NOT NULL,
    "firedCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuppressedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertCooldown_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AlertCooldown_key_key" ON "AlertCooldown"("key");
CREATE INDEX IF NOT EXISTS "AlertCooldown_severity_lastFiredAt_idx"
    ON "AlertCooldown"("severity", "lastFiredAt");
