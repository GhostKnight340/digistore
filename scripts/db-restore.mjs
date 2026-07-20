// Restores a backup into a NON-PRODUCTION database.
//
//   GHOST_RESTORE_TARGET_URL='postgresql://…scratch-branch…' \
//   CONFIRM_RESTORE=true \
//     node scripts/db-restore.mjs backups/ghost-dev-….sql.gz.enc
//
// This script REFUSES to restore into production, unconditionally and with no
// override flag. That is deliberate: a production restore is a decision that
// should involve a human reading docs/database-backup-and-recovery.md and using
// Neon's own point-in-time recovery, which is faster, safer and does not depend
// on a dump being current. There is no `--force`, and adding one would be a
// mistake.
//
// The target is taken from GHOST_RESTORE_TARGET_URL ONLY — never from
// DATABASE_URL — so a restore can never inherit whatever database happens to be
// configured for the app.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { activeDbIsProduction } from "./lib/db-guard.mjs";

const file = process.argv[2];

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!file) {
  die(
    "Usage:\n" +
      "  GHOST_RESTORE_TARGET_URL='postgresql://…' CONFIRM_RESTORE=true \\\n" +
      "    node scripts/db-restore.mjs <backup-file.sql.gz.enc>",
  );
}
if (!fs.existsSync(file)) die(`No such file: ${file}`);

const target = process.env.GHOST_RESTORE_TARGET_URL;
if (!target) {
  die(
    "GHOST_RESTORE_TARGET_URL is not set.\n" +
      "The restore target must be given EXPLICITLY — it is never taken from\n" +
      "DATABASE_URL, so a restore cannot accidentally inherit the app's database.\n" +
      "Create a scratch Neon branch and pass its connection string.",
  );
}

// ── Production refusal ──────────────────────────────────────────────────────
// Two independent checks, either of which aborts. Host comparison catches the
// case where production credentials were pasted into the target by mistake.
const prodEnvPath = path.resolve(process.cwd(), ".env.production.local");
const hostOf = (url) => (url || "").match(/@([^/?]+)/)?.[1]?.toLowerCase().replace(/-pooler\b/, "") ?? "";

if (fs.existsSync(prodEnvPath)) {
  const prodUrl = dotenv.parse(fs.readFileSync(prodEnvPath));
  const prodHost = hostOf(prodUrl.DATABASE_URL || prodUrl.DIRECT_URL || prodUrl.DATABASE_URL_UNPOOLED);
  if (prodHost && hostOf(target) === prodHost) {
    die(
      "REFUSING: the restore target is the PRODUCTION database.\n\n" +
        "This script never restores into production, and has no override flag.\n" +
        "To recover production, use Neon point-in-time recovery — see\n" +
        "docs/database-backup-and-recovery.md § Restoring production.",
    );
  }
}

// Also refuse if the ambient environment marks itself as production.
process.env.DATABASE_URL = target;
if (activeDbIsProduction()) {
  die(
    "REFUSING: this environment is marked as production (GHOST_DB_ENV or a\n" +
      "matching production host). See docs/database-backup-and-recovery.md.",
  );
}

if (process.env.CONFIRM_RESTORE !== "true") {
  die(
    "A restore OVERWRITES the target database.\n" +
      `  target host: ${hostOf(target) || "(unparseable)"}\n` +
      `  backup file: ${file}\n\n` +
      "Re-run with CONFIRM_RESTORE=true once you are sure the target is a scratch\n" +
      "database you are willing to lose.",
  );
}

if (!process.env.GHOST_BACKUP_PASSPHRASE) {
  die("GHOST_BACKUP_PASSPHRASE is not set — it is required to decrypt the backup.");
}

for (const tool of ["psql", "openssl", "gzip"]) {
  if (spawnSync(tool, ["--version"], { stdio: "ignore" }).error) {
    die(`\`${tool}\` was not found on PATH.`);
  }
}

console.log(`[db-restore] target host: ${hostOf(target)}`);
console.log(`[db-restore] restoring from ${file}`);

const decrypt = spawn(
  "openssl",
  ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", "env:GHOST_BACKUP_PASSPHRASE", "-in", file],
  { stdio: ["ignore", "pipe", "inherit"], env: process.env },
);
const gunzip = spawn("gzip", ["-dc"], { stdio: [decrypt.stdout, "pipe", "inherit"] });
// ON_ERROR_STOP so a failed statement aborts loudly instead of leaving a
// half-restored database that looks fine.
const psql = spawn("psql", ["--set", "ON_ERROR_STOP=1", target], {
  stdio: [gunzip.stdout, "inherit", "inherit"],
});

psql.on("close", (code) => {
  if (code !== 0) {
    die(`Restore FAILED (psql exited ${code}). The target may be partially written.`);
  }
  console.log("[db-restore] done.");
  console.log("[db-restore] Sanity-check row counts before trusting this database.");
});
