/**
 * Scheduled supplier maintenance jobs.
 *
 * All jobs here are idempotent and safe to overlap: they only ever read
 * supplier state and advance the ledger through guarded transitions, so a
 * second concurrent run finds the work already done rather than repeating it.
 *
 * None of them ever place a supplier order.
 */
import "server-only";
import { prisma } from "./prisma";
import { reconcileDueSlots } from "@/lib/fazercards/reconcile";
import { deliverFulfilledSlot, listDeliverableSlots } from "./supplierDelivery";
import { listNeedingManualReview } from "@/lib/suppliers/ledger";
import { getSupplierProvider, SUPPLIER_SLUGS } from "@/lib/suppliers/registry";
import { recordSupplierCheck, recordSupplierBalance } from "./supplierManagement";
import { notifySupplierAlert } from "@/lib/discord/supplierAlerts";

export type ReconciliationSummary = {
  reconciled: number;
  completed: number;
  failed: number;
  pending: number;
  delivered: number;
  manualReview: number;
};

/**
 * One reconciliation cycle: resolve ambiguous slots, then hand over anything
 * that turned out to be complete, then escalate what remains stuck.
 *
 * The ordering matters — reconciling first means a slot that completes during
 * this pass is delivered in the same run rather than waiting for the next one.
 */
export async function runSupplierReconciliation(): Promise<ReconciliationSummary> {
  const counts = await reconcileDueSlots(25);

  // Deliver everything that is purchased-and-parsed but not yet handed over.
  // This deliberately includes slots completed by earlier runs or by a webhook,
  // so a delivery failure is retried rather than silently lost.
  let delivered = 0;
  for (const slot of await listDeliverableSlots(25)) {
    try {
      const result = await deliverFulfilledSlot(slot.id);
      if (result.ok) delivered += 1;
    } catch (error) {
      console.error("[supplier-jobs:deliver]", slot.id, error);
    }
  }

  // Escalate slots automated resolution cannot settle. Deduplicated by the
  // notifier's cooldown so a persistently stuck order does not spam the channel
  // every cron tick.
  const stuck = await listNeedingManualReview({ olderThanMinutes: 30 });
  if (stuck.length > 0) {
    await notifySupplierAlert({
      key: "reconciliation_required",
      supplier: stuck[0].supplier,
      title: `${stuck.length} commande(s) fournisseur à réconcilier`,
      detail:
        "Résultat d’achat indéterminé au-delà du seuil automatique. " +
        "Vérifiez le tableau de bord fournisseur AVANT toute nouvelle tentative.",
      severity: "critical",
    });
  }

  return {
    reconciled: counts.processed,
    completed: counts.completed,
    failed: counts.failed,
    pending: counts.pending,
    delivered,
    manualReview: stuck.length,
  };
}

export type HealthRefreshSummary = {
  checked: number;
  healthy: number;
  failed: number;
};

/**
 * Refreshes account/subscription state and wallet balance for every configured
 * supplier, so the ops dashboard reflects reality rather than the last time an
 * admin happened to click "Tester la connexion".
 *
 * Read-only. A supplier that is disabled or unconfigured is skipped, not
 * probed — we must not generate auth failures for suppliers we deliberately
 * turned off.
 */
export async function runSupplierHealthRefresh(): Promise<HealthRefreshSummary> {
  let checked = 0;
  let healthy = 0;
  let failed = 0;

  for (const slug of SUPPLIER_SLUGS) {
    const provider = getSupplierProvider(slug);
    if (!provider.isConfigured()) continue;

    const row = await prisma.supplier.findUnique({ where: { id: slug } });
    if (row && !row.enabled) continue;

    checked += 1;
    const startedAt = Date.now();
    try {
      const test = await provider.testConnection();
      await recordSupplierCheck(slug, {
        ok: test.ok,
        message: test.ok ? null : test.message,
        latencyMs: Date.now() - startedAt,
      });

      if (test.ok) {
        healthy += 1;
      } else {
        failed += 1;
        await notifySupplierAlert({
          key: "health_failed",
          supplier: slug,
          title: `${provider.name} : vérification de connexion échouée`,
          detail: test.message,
          severity: "critical",
        });
      }

      if (provider.getBalance) {
        try {
          const balance = await provider.getBalance();
          await recordSupplierBalance(slug, {
            amount: balance.amount,
            currency: balance.currency,
          });
          await warnOnLowBalance(slug, provider.name, balance.amount, balance.currency);
        } catch {
          // A balance read failing must not mark the supplier unhealthy —
          // the connection test above is the authority on that.
        }
      }
    } catch (error) {
      failed += 1;
      console.error(`[supplier-jobs:health:${slug}]`, error);
      await recordSupplierCheck(slug, {
        ok: false,
        message: "Vérification automatique impossible.",
      });
    }
  }

  return { checked, healthy, failed };
}

/** Emits low/critical balance alerts against the supplier's configured thresholds. */
async function warnOnLowBalance(
  slug: string,
  name: string,
  amount: string,
  currency: string,
): Promise<void> {
  const row = await prisma.supplier.findUnique({
    where: { id: slug },
    select: { warningBalance: true, criticalBalance: true },
  });
  const value = Number(amount);
  if (!Number.isFinite(value)) return;

  const critical = Number(row?.criticalBalance ?? "10");
  const warning = Number(row?.warningBalance ?? "50");

  if (Number.isFinite(critical) && value <= critical) {
    await notifySupplierAlert({
      key: "balance_critical",
      supplier: slug,
      title: `${name} : solde CRITIQUE (${amount} ${currency})`,
      detail: "Les achats automatiques vont échouer. Rechargez le portefeuille fournisseur.",
      severity: "critical",
    });
  } else if (Number.isFinite(warning) && value <= warning) {
    await notifySupplierAlert({
      key: "balance_low",
      supplier: slug,
      title: `${name} : solde bas (${amount} ${currency})`,
      detail: "Prévoyez un rechargement du portefeuille fournisseur.",
      severity: "warning",
    });
  }
}
