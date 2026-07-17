/**
 * Dashboard aggregation — assembles the full {@link OperationsSnapshotDTO} the
 * admin Operations page renders, from the health service, metrics service,
 * supplier state and the warning engine. One entry point, everything in
 * parallel, cached supplier state (no live provider calls on refresh).
 */
import "server-only";
import { getStoreSettings } from "@/lib/db/catalog";
import { isOrderingEnabled } from "@/lib/storeSettings";
import { runtimeEnvLabel } from "@/lib/env";
import { listSupplierCards } from "@/lib/db/supplierManagement";
import { runCoreHealthChecks } from "./health";
import {
  getNotificationsMetrics,
  getOrdersMetrics,
  getPaymentsMetrics,
  getProductsMetrics,
  getRecentActivity,
} from "./metrics";
import { computeWarnings } from "./warnings";
import { rollUpHealth } from "./types";
import type { OperationsSnapshotDTO } from "@/lib/dto";

export async function getOperationsSnapshot(): Promise<OperationsSnapshotDTO> {
  const [settings, health, suppliers, orders, payments, products, notifications, activity] =
    await Promise.all([
      getStoreSettings(),
      runCoreHealthChecks(),
      listSupplierCards(),
      getOrdersMetrics(),
      getPaymentsMetrics(),
      getProductsMetrics(),
      getNotificationsMetrics(),
      getRecentActivity(),
    ]);

  const generatedAt = new Date().toISOString();

  const warnings = computeWarnings({
    detectedAt: generatedAt,
    health,
    suppliers: suppliers.map((s) => ({
      slug: s.slug,
      name: s.name,
      enabled: s.enabled,
      configured: s.configured,
      health: s.health,
      balanceAmount: s.balance?.amount ?? null,
      balanceCurrency: s.balance?.currency ?? null,
      lastFailureMessage: s.lastFailureMessage,
    })),
    orders: {
      waitingTooLong: orders.waitingTooLong,
      paymentIssue: orders.paymentIssue,
      recentFailedPurchases: orders.recentFailedPurchases,
    },
    payments: {
      rejectedToday: payments.rejectedToday,
      confirmedToday: payments.confirmedToday,
      misconfiguredCount: payments.misconfiguredMethods.length,
    },
    products: {
      missingSupplyRoute: products.missingSupplyRoute,
      incompleteMapping: products.incompleteMapping,
    },
    notifications: {
      emailFailures24h: notifications.emailFailures24h,
      discordFailures24h: notifications.discordFailures24h,
    },
  });

  // Overall status also reflects supplier offline state, not just infra health.
  const supplierHealthForRollup = suppliers
    .filter((s) => s.configured)
    .map((s) => ({
      status: (s.health === "offline"
        ? "offline"
        : s.health === "warning"
          ? "warning"
          : s.health === "healthy"
            ? "healthy"
            : "unknown") as "healthy" | "warning" | "offline" | "unknown",
    }));
  const overallStatus = rollUpHealth([...health, ...supplierHealthForRollup]);

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;

  return {
    generatedAt,
    environmentLabel: runtimeEnvLabel(),
    version: sha ? sha.slice(0, 7) : "local",
    maintenanceEnabled: settings.maintenance.enabled,
    ordersEnabled: isOrderingEnabled(settings),
    overallStatus,
    health,
    suppliers,
    orders,
    payments,
    products,
    notifications,
    warnings,
    activity,
  };
}
