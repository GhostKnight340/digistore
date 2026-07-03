/**
 * Production migration runner — invoked from the build step BEFORE `next build`,
 * so the schema is up to date before the app boots.
 *
 * This project's database was originally built by a runtime DDL bootstrap, not by
 * Prisma Migrate, so production may have the full schema but no `_prisma_migrations`
 * history. Running a plain `prisma migrate deploy` there would try to re-create
 * existing tables and fail. This script adopts Migrate safely:
 *
 *   1. If `_prisma_migrations` already exists  -> just `migrate deploy` (normal case).
 *   2. If it's missing but the schema exists   -> baseline: mark every already-present
 *      migration as applied, then `migrate deploy` the remaining (new, idempotent) ones.
 *   3. If the database is empty                -> `migrate deploy` creates everything.
 *
 * Only the migrations in APPLY_NOT_BASELINE actually run against an existing
 * production database; they are written idempotently (IF NOT EXISTS / guarded
 * backfills), so they are safe whether or not their objects already exist. Every
 * other migration predates this adoption effort and its changes are already present
 * (the live app depends on them), so we mark it applied rather than re-run it.
 *
 * Nothing here drops or resets data.
 */
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Migrations introduced by / after the Migrate-adoption change. These are safe to
// actually execute against production because they are idempotent, so we let
// `migrate deploy` run them instead of baselining them as already-applied.
const APPLY_NOT_BASELINE = new Set([
  "20260702223000_add_order_number",
  "20260703090000_reconcile_runtime_ddl",
]);

const MIGRATIONS_DIR = "prisma/migrations";

function looksLikePostgresUrl(value) {
  return typeof value === "string" && /^postgres(ql)?:\/\//.test(value.trim());
}

/**
 * Prisma Migrate uses `directUrl = env("DIRECT_URL")`. Production may not have
 * DIRECT_URL set (the app historically ran on DATABASE_URL only), which fails with
 * P1013. Resolve a usable direct (ideally non-pooled) connection, preferring an
 * explicit DIRECT_URL, then the common Vercel/Neon non-pooling names, then the
 * pooled DATABASE_URL as a last resort. Set it on the env so the child
 * `prisma` processes inherit it.
 */
function ensureDirectUrl() {
  if (looksLikePostgresUrl(process.env.DIRECT_URL)) return;

  const fallback = [
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DATABASE_URL,
  ].find(looksLikePostgresUrl);

  if (!fallback) {
    throw new Error(
      "No valid Postgres connection string found for migrations. Set DIRECT_URL " +
        "(preferred: the direct, non-pooled connection) or DATABASE_URL.",
    );
  }
  process.env.DIRECT_URL = fallback;
  if (fallback === process.env.DATABASE_URL) {
    console.warn(
      "[migrate] DIRECT_URL not set — falling back to DATABASE_URL. For reliability " +
        "on pooled connections (e.g. Neon/Supabase pooler), set DIRECT_URL to the " +
        "direct, non-pooled connection string.",
    );
  } else {
    console.log("[migrate] Using a non-pooled connection for migrations.");
  }
}

function runPrisma(args) {
  execFileSync("npx", ["prisma", ...args], { stdio: "inherit" });
}

function migrationNames() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function needsBaseline(prisma) {
  // Only an existing schema WITHOUT recorded migration history needs baselining.
  const [{ has_schema }] = await prisma.$queryRawUnsafe(
    `SELECT (to_regclass('public."Order"') IS NOT NULL) AS has_schema`,
  );
  if (!has_schema) return false; // Empty database — deploy creates everything.

  const [{ has_table }] = await prisma.$queryRawUnsafe(
    `SELECT (to_regclass('public._prisma_migrations') IS NOT NULL) AS has_table`,
  );
  if (!has_table) return true; // Schema exists, no history table -> baseline.

  // History table exists but may be empty (e.g. partially initialised).
  const [{ applied }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS applied FROM public._prisma_migrations WHERE finished_at IS NOT NULL`,
  );
  return applied === 0;
}

async function main() {
  ensureDirectUrl();
  const prisma = new PrismaClient();
  try {
    if (await needsBaseline(prisma)) {
      console.log(
        "[migrate] Existing database without migration history detected — baselining.",
      );
      for (const name of migrationNames()) {
        if (APPLY_NOT_BASELINE.has(name)) continue;
        console.log(`[migrate] baseline: marking ${name} as applied`);
        runPrisma(["migrate", "resolve", "--applied", name]);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("[migrate] Applying pending migrations…");
  runPrisma(["migrate", "deploy"]);
}

main().catch((error) => {
  console.error("[migrate] Failed:", error);
  process.exit(1);
});
