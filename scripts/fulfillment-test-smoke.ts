// Headless runner for the Fulfillment Test Center — the SAME code path the
// admin button calls, without an admin session or the UI. Not run by CI, not
// imported by app code.
//
// Usage:
//   pnpm fulfillment:smoke-test                 # sandbox, full pipeline
//   pnpm fulfillment:smoke-test --mode=purchase # sandbox, single stage
//   pnpm fulfillment:smoke-test --discord       # also send a [TEST] Discord ping
//   pnpm fulfillment:smoke-test --live          # production (read-only; no purchase)
//
// Requires the environment it runs in to have the relevant Reloadly credentials
// (RELOADLY_SANDBOX_CLIENT_ID / _SECRET for sandbox) and the FulfillmentTestRun
// migration applied. Sandbox spends fake wallet money on a non-redeemable code.
import { runFulfillmentTest } from "../src/lib/fulfillment-test/runner";
import type { TestEnvironment, TestMode } from "../src/lib/fulfillment-test/types";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const environment: TestEnvironment = flag("live") ? "live" : "sandbox";
  const mode = (arg("mode") ?? "full") as TestMode;
  const sendDiscord = flag("discord");

  console.log(`\n▶ Fulfillment smoke test — ${environment} · mode=${mode}\n`);

  const result = await runFulfillmentTest({
    environment,
    mode,
    // Dangerous-mode gate: live still requires the explicit token.
    confirmation: environment === "live" ? "CONFIRM" : undefined,
    sendDiscord,
    createdBy: "smoke-test",
  });

  console.log("Health checks:");
  for (const c of result.healthChecks) {
    const icon = c.status === "ok" ? "✓" : c.status === "fail" ? "✗" : "•";
    console.log(`  ${icon} ${c.name} — ${c.detail}`);
  }

  console.log("\nStages:");
  for (const s of result.stages) {
    const icon =
      s.status === "passed" ? "🟢" : s.status === "failed" ? "🔴" : s.status === "warning" ? "🟡" : "⚪";
    console.log(`  ${icon} ${s.name} — ${s.durationMs} ms${s.detail ? ` · ${s.detail}` : ""}`);
  }

  if (result.productUsed) console.log(`\nProduct exercised: ${result.productUsed}`);
  for (const w of result.warnings) console.log(`⚠ ${w}`);
  if (result.discordSent) console.log("Discord [TEST] notification sent.");
  if (result.safeError) console.log(`\nError: ${result.safeError}`);

  console.log(
    `\n${result.status === "passed" ? "✅ PASS" : "❌ FAIL"} · ${result.durationMs} ms · health ${result.healthScore}% · run ${result.id}\n`,
  );

  process.exitCode = result.status === "passed" ? 0 : 1;
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
