/**
 * Cybrancee launcher for the Discord CEO-assistant worker.
 *
 * Cybrancee's generic Node egg starts a single file with `node <BOT_JS_FILE>`
 * and cannot run an npm script or `tsx` directly. This CommonJS shim IS that
 * entry point: point the egg's BOT_JS_FILE at
 * `scripts/cybrancee-assistant-worker.cjs` and it execs the repo's TypeScript
 * worker through the locally-installed `tsx` runtime, unchanged.
 *
 * The three env vars the worker needs (DISCORD_BOT_TOKEN,
 * DISCORD_DM_WORKER_SECRET, INTERNAL_API_BASE_URL) come from a `.env` file in
 * the container root, loaded by the worker via `dotenv/config`.
 *
 * See docs/cybrancee-discord-worker.md (same host pattern as the DM worker).
 */
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const worker = path.join(__dirname, "discord-assistant-worker.ts");

if (!fs.existsSync(tsxBin)) {
  console.error(
    "[cybrancee-launcher] node_modules/.bin/tsx not found — did `npm install` run? Aborting.",
  );
  process.exit(1);
}

console.log("[cybrancee-launcher] starting the assistant worker via tsx…");
const child = spawn(tsxBin, [worker], { stdio: "inherit", cwd: repoRoot });

child.on("exit", (code) => process.exit(code == null ? 0 : code));
child.on("error", (err) => {
  console.error("[cybrancee-launcher] failed to start worker:", err.message);
  process.exit(1);
});

// Forward stop signals so the Gateway connection closes cleanly.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
