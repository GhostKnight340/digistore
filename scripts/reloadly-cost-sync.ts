// Manual/cron entry point for the Reloadly provider-cost sync. Writes ONLY into
// the ReloadlyProviderCost / PricingSyncRun cost layer — it never touches
// ProductVariant.priceMad and never publishes a customer price.
//
// Usage:
//   npm run reloadly:cost-sync          # syncs whatever RELOADLY_ENV is set to
//
// Safety: RELOADLY_ENV fails closed to "sandbox" (see src/lib/reloadly/config).
// A live run additionally requires CONFIRM_LIVE=1 so a stray env var can't
// silently pull production cost data.
import { getReloadlyEnvironment } from "../src/lib/reloadly/config";
import { syncReloadlyProviderCosts } from "../src/lib/db/pricing";

async function main() {
  const environment = getReloadlyEnvironment();
  console.log(`[reloadly:cost-sync] environment = ${environment}`);

  if (environment === "live" && process.env.CONFIRM_LIVE !== "1") {
    console.error(
      "[reloadly:cost-sync] Refusing a LIVE sync without CONFIRM_LIVE=1. " +
        "Re-run with CONFIRM_LIVE=1 to sync production cost data.",
    );
    process.exitCode = 1;
    return;
  }

  const result = await syncReloadlyProviderCosts();
  console.log("[reloadly:cost-sync] result:", JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[reloadly:cost-sync] FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Release the Postgres pool so the process exits promptly.
    const { prisma } = await import("../src/lib/db/prisma");
    await prisma.$disconnect();
  });
