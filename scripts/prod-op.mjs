// Explicit PRODUCTION database operation runner.
//
// Loads ONLY .env.production.local (never .env / .env.local), marks the target
// as production, guards write operations behind CONFIRM_PRODUCTION_DB=true, then
// runs the requested prisma command. Used by the prod:* npm scripts.
//
//   node scripts/prod-op.mjs migrate status     # read-only, no confirmation
//   CONFIRM_PRODUCTION_DB=true \
//     node scripts/prod-op.mjs migrate deploy    # WRITE, requires confirmation
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { assertWriteAllowed } from "./lib/db-guard.mjs";

const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
if (!fs.existsSync(prodEnvPath)) {
  console.error(
    [
      "",
      "Missing .env.production.local.",
      "Create it with the PRODUCTION connection (and mark it), e.g.:",
      "",
      "    GHOST_DB_ENV=production",
      "    DATABASE_URL=postgresql://…prod-pooler…/neondb?sslmode=require",
      "    DIRECT_URL=postgresql://…prod (non-pooler)…/neondb?sslmode=require",
      "",
      "It is gitignored and never loaded by dev/scripts. See docs/db-safety.md.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// Load production env, then force the marker so the guard + downstream code
// unambiguously know this run targets production.
dotenv.config({ path: prodEnvPath });
process.env.GHOST_DB_ENV = "production";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prod-op.mjs <prisma args>  (e.g. migrate status)");
  process.exit(1);
}

// Operations that mutate the database require explicit confirmation.
const joined = args.join(" ");
const WRITE_PREFIXES = [
  "migrate deploy",
  "migrate dev",
  "migrate reset",
  "db push",
  "db execute",
  "db seed",
];
const isWrite = WRITE_PREFIXES.some((p) => joined.startsWith(p));
if (isWrite) assertWriteAllowed(`prisma ${joined} (production)`);

console.log(`[prod-op] target=production op="prisma ${joined}" write=${isWrite}`);

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
