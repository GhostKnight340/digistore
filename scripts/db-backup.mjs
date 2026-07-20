// Encrypted logical database backup.
//
//   node scripts/db-backup.mjs                    # backs up the ACTIVE db (.env.local → dev)
//   node scripts/db-backup.mjs --production       # backs up production (read-only, still confirmed)
//   node scripts/db-backup.mjs --out /path/dir
//
// Produces `<dir>/ghost-<env>-<timestamp>.sql.gz.enc`, encrypted with AES-256
// using a passphrase from GHOST_BACKUP_PASSPHRASE. Verify one with
// scripts/db-verify-backup.mjs; restore with scripts/db-restore.mjs.
//
// This is a SUPPLEMENT to Neon's own point-in-time recovery, not a replacement.
// Neon PITR is faster, more complete and needs no maintenance; a logical dump
// exists for the cases PITR cannot serve — moving data between branches,
// keeping an off-provider copy, or inspecting a table as of a point in time.
// See docs/database-backup-and-recovery.md.
//
// Requires `pg_dump` (PostgreSQL client tools) and `openssl` on PATH.
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const args = process.argv.slice(2);
const useProduction = args.includes("--production");
const outDir = valueOf("--out") ?? path.resolve(process.cwd(), "backups");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// ── Environment selection ───────────────────────────────────────────────────
// Production is loaded ONLY from .env.production.local, the same file and the
// same rule as scripts/prod-op.mjs, so there is exactly one way to reach prod.
if (useProduction) {
  const prodEnv = path.resolve(process.cwd(), ".env.production.local");
  if (!fs.existsSync(prodEnv)) {
    die(
      "Missing .env.production.local.\n" +
        "Create it with the production connection (see docs/db-safety.md), e.g.\n" +
        "  vercel env pull .env.production.local --environment=production",
    );
  }
  dotenv.config({ path: prodEnv });
  process.env.GHOST_DB_ENV = "production";
} else {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

const label = useProduction ? "production" : "dev";

// A backup is a READ. It cannot damage the source, so it does not require
// CONFIRM_PRODUCTION_DB the way a write does — but it does produce a file
// containing every customer record, so it announces its target loudly.
console.log(`[db-backup] target=${label}`);

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  die("No DIRECT_URL or DATABASE_URL is set for this environment.");
}

const passphrase = process.env.GHOST_BACKUP_PASSPHRASE;
if (!passphrase) {
  die(
    "GHOST_BACKUP_PASSPHRASE is not set.\n" +
      "A dump contains every customer record and every delivered code, so it is\n" +
      "never written unencrypted. Set a strong passphrase and store it somewhere\n" +
      "OTHER than this repository — losing it makes the backup unreadable.\n\n" +
      "  export GHOST_BACKUP_PASSPHRASE='…'",
  );
}

for (const tool of ["pg_dump", "openssl"]) {
  const probe = spawnSync(tool, ["--version"], { stdio: "ignore" });
  if (probe.error) {
    die(`\`${tool}\` was not found on PATH. Install the PostgreSQL client tools and OpenSSL.`);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `ghost-${label}-${stamp}.sql.gz.enc`);

console.log(`[db-backup] writing ${outFile}`);

// pg_dump → gzip → openssl enc. Piped rather than staged through temp files so
// an UNENCRYPTED dump never touches the disk, not even briefly.
const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", "--format=plain", databaseUrl], {
  stdio: ["ignore", "pipe", "inherit"],
});
const gzip = spawn("gzip", ["-c"], { stdio: [dump.stdout, "pipe", "inherit"] });
const encrypt = spawn(
  "openssl",
  ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-pass", "env:GHOST_BACKUP_PASSPHRASE"],
  { stdio: [gzip.stdout, fs.openSync(outFile, "w"), "inherit"], env: process.env },
);

encrypt.on("close", (code) => {
  if (code !== 0) {
    // A partial file is worse than none: it looks like a backup and is not one.
    fs.rmSync(outFile, { force: true });
    die(`Backup failed (openssl exited ${code}). The partial file was removed.`);
  }
  const bytes = fs.statSync(outFile).size;
  if (bytes < 1024) {
    fs.rmSync(outFile, { force: true });
    die(`Backup produced only ${bytes} bytes — treating as a failure. File removed.`);
  }
  console.log(`[db-backup] done — ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[db-backup] VERIFY IT NOW: node scripts/db-verify-backup.mjs ${outFile}`);
  console.log("[db-backup] An unverified backup is a guess, not a backup.");
});
