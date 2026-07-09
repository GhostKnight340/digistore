// Production-database safety guard for CLI scripts. Pure Node ESM (no deps),
// importable from plain-node scripts (prod-op.mjs) and from tsx scripts
// (seed.ts, reloadly-cost-sync.ts).
//
// It NEVER prints connection strings or secrets — only host-level comparisons.
import fs from "node:fs";
import path from "node:path";

/** Extract the host from a postgres URL, normalizing Neon pooled/direct to equal. */
function hostOf(url) {
  const m = (url || "").match(/@([^/?]+)/);
  if (!m) return "";
  return m[1].toLowerCase().replace(/-pooler\b/, "");
}

/** Read one KEY=value from an env file without loading it into process.env. */
function readEnvValue(filePath, key) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file may not exist — that's fine */
  }
  return undefined;
}

/**
 * True when the currently-active DATABASE_URL/DIRECT_URL targets production.
 * Two independent signals, either is sufficient:
 *   1. An explicit marker `GHOST_DB_ENV=production` (set by the prod:* scripts,
 *      and recommended inside .env.production.local).
 *   2. The active DB host matches the host in .env.production.local — this
 *      catches the dangerous case of production creds accidentally living in
 *      .env / .env.local, even without the marker.
 */
export function activeDbIsProduction() {
  if ((process.env.GHOST_DB_ENV || "").toLowerCase() === "production") return true;

  const active = process.env.DATABASE_URL || process.env.DIRECT_URL || "";
  const activeHost = hostOf(active);
  if (!activeHost) return false;

  const prodFile = path.resolve(process.cwd(), ".env.production.local");
  const prodUrl =
    readEnvValue(prodFile, "DATABASE_URL") || readEnvValue(prodFile, "DIRECT_URL");
  const prodHost = hostOf(prodUrl);
  return !!prodHost && activeHost === prodHost;
}

/**
 * Aborts (exit 1) if a WRITE operation is about to run against production
 * without an explicit `CONFIRM_PRODUCTION_DB=true`. Read-only operations should
 * NOT call this. Never prints the URL.
 */
export function assertWriteAllowed(opName = "cette opération") {
  if (activeDbIsProduction() && process.env.CONFIRM_PRODUCTION_DB !== "true") {
    console.error(
      [
        "",
        `⛔ REFUS: « ${opName} » écrirait sur la base de PRODUCTION.`,
        "",
        "   Le développement local doit viser la branche Neon de dev",
        "   (.env.local / .env), jamais la production.",
        "",
        "   Pour l'exécuter volontairement sur la production, relancez avec :",
        "       CONFIRM_PRODUCTION_DB=true <votre commande>",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}
