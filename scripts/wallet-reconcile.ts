// Ghost Credit wallet reconciliation. READ-ONLY by default: recomputes each
// wallet balance from the append-only ledger and compares it to the cached
// Customer.ghostCreditBalanceMad, reporting any drift. The ledger is never
// modified. Repair (opt-in) only corrects the performance cache to match the
// ledger — it never rewrites history.
//
// Usage:
//   npm run wallet:reconcile              # report mismatches (read-only)
//   npm run wallet:reconcile -- --repair  # also fix drifted CACHE values
//
// Repair requires WALLET_REPAIR_CONFIRM=1 in addition to --repair so a stray
// flag can't mutate production balances.
import { reconcileAllWallets, reconcileExpiry, repairWalletCache } from "../src/lib/db/walletReconcile";

async function main() {
  const repair = process.argv.includes("--repair");
  const { checked, mismatches } = await reconcileAllWallets();

  // Expiry-invariant check (deadline == last qualifying event + inactivity days).
  const expiry = await reconcileExpiry();
  console.log(`[wallet:reconcile] expiry: checked ${expiry.checked}, ${expiry.mismatches.length} mismatch(es)`);
  for (const e of expiry.mismatches) {
    console.log(`  customer=${e.customerId} stored=${e.storedExpiresAt} expected=${e.expectedExpiresAt}`);
  }

  console.log(`[wallet:reconcile] checked ${checked} wallet(s) with ledger history`);
  if (mismatches.length === 0) {
    console.log("[wallet:reconcile] OK — every cached balance matches the ledger.");
    return;
  }

  console.log(`[wallet:reconcile] ${mismatches.length} MISMATCH(es):`);
  for (const m of mismatches) {
    console.log(
      `  customer=${m.customerId} email=${m.email} cached=${m.cachedMad} derived=${m.derivedMad} diff=${m.diffMad}${m.frozen ? " [FROZEN]" : ""}`,
    );
  }

  if (!repair) {
    console.log("\nRe-run with `-- --repair` (and WALLET_REPAIR_CONFIRM=1) to fix cached balances.");
    process.exitCode = 1;
    return;
  }
  if (process.env.WALLET_REPAIR_CONFIRM !== "1") {
    console.error("\n[wallet:reconcile] Refusing to repair without WALLET_REPAIR_CONFIRM=1.");
    process.exitCode = 1;
    return;
  }

  console.log("\n[wallet:reconcile] repairing cached balances (ledger untouched)…");
  for (const m of mismatches) {
    const result = await repairWalletCache(m.customerId);
    console.log(`  customer=${m.customerId} ${result.before} -> ${result.after}${result.changed ? "" : " (no change)"}`);
  }
  console.log("[wallet:reconcile] repair complete.");
}

main()
  .catch((error) => {
    console.error("[wallet:reconcile] failed:", error);
    process.exitCode = 1;
  });
