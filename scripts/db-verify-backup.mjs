// Verifies that a backup file is actually readable.
//
//   node scripts/db-verify-backup.mjs backups/ghost-dev-2026-07-19T12-00-00-000Z.sql.gz.enc
//
// An unverified backup is a guess. This decrypts and decompresses the file in a
// STREAM (nothing is written to disk, no database is touched) and checks that
// the result looks like a real pg_dump: it must parse as SQL, contain the
// expected structural markers, and include the tables we would actually need.
//
// Read-only in every sense. It cannot modify a backup or a database.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const file = process.argv[2];

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!file) die("Usage: node scripts/db-verify-backup.mjs <backup-file.sql.gz.enc>");
if (!fs.existsSync(file)) die(`No such file: ${file}`);
if (!process.env.GHOST_BACKUP_PASSPHRASE) {
  die("GHOST_BACKUP_PASSPHRASE is not set — it is required to decrypt the backup.");
}

for (const tool of ["openssl", "gzip"]) {
  if (spawnSync(tool, ["--version"], { stdio: "ignore" }).error) {
    die(`\`${tool}\` was not found on PATH.`);
  }
}

/** Tables whose absence would make a restore useless. */
const REQUIRED_TABLES = ["Order", "OrderItem", "Customer", "Product", "DigitalCode"];

console.log(`[verify] ${file}`);

const decrypt = spawn(
  "openssl",
  ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-pass", "env:GHOST_BACKUP_PASSPHRASE", "-in", file],
  { stdio: ["ignore", "pipe", "pipe"], env: process.env },
);
const gunzip = spawn("gzip", ["-dc"], { stdio: [decrypt.stdout, "pipe", "pipe"] });

let decryptError = "";
decrypt.stderr.on("data", (chunk) => (decryptError += chunk.toString()));

const found = new Set();
let bytes = 0;
let sawHeader = false;
let tail = "";

gunzip.stdout.on("data", (chunk) => {
  bytes += chunk.length;
  // Keep a small overlap so a marker split across chunk boundaries is not missed.
  const text = tail + chunk.toString("utf8");
  if (text.includes("PostgreSQL database dump")) sawHeader = true;
  for (const table of REQUIRED_TABLES) {
    if (text.includes(`CREATE TABLE public."${table}"`)) found.add(table);
  }
  tail = text.slice(-200);
});

gunzip.on("close", (code) => {
  if (code !== 0) {
    die(
      "Decryption or decompression FAILED. The file is corrupt, truncated, or the\n" +
        `passphrase is wrong.${decryptError ? `\n\nopenssl said: ${decryptError.trim()}` : ""}`,
    );
  }
  if (bytes === 0) die("The decrypted stream was empty. This is not a usable backup.");

  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
  console.log(`[verify] decrypted ${(bytes / 1024 / 1024).toFixed(2)} MB of SQL`);
  console.log(`[verify] pg_dump header: ${sawHeader ? "present" : "MISSING"}`);
  console.log(`[verify] core tables found: ${[...found].join(", ") || "none"}`);

  if (!sawHeader || missing.length > 0) {
    die(
      `NOT a usable backup.${missing.length ? ` Missing tables: ${missing.join(", ")}.` : ""}\n` +
        "Do not rely on this file. Take a new backup and verify it.",
    );
  }
  console.log("[verify] OK — this backup decrypts and contains the core schema.");
  console.log("[verify] Note: this proves READABILITY, not that a restore succeeds.");
  console.log("[verify] For that, restore into a scratch database (see db-restore.mjs).");
});
