/**
 * Dashboard aggregation — assembles the full {@link OperationsSnapshotDTO} the
 * admin Operations control center renders, from the health service, metrics
 * service, overview aggregations, supplier state and the warning engine. One
 * entry point, everything in parallel, cached supplier state (no live provider
 * calls on refresh).
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
import {
  getJobsStatus,
  getOpsKpi,
  getOrderPipeline,
  getRecentOrdersForOps,
  getWalletFloat,
  type OpsTimeRange,
} from "./overview";
import { computeWarnings } from "./warnings";
import { rollUpHealth } from "./types";
import type {
  OperationsSnapshotDTO,
  OpsAnnouncementDTO,
  OpsHealthStatus,
  OpsStatusChipDTO,
  OpsSystemStatusDTO,
  SupplierCardDTO,
} from "@/lib/dto";

export async function getOperationsSnapshot(options?: {
  adminName?: string;
  range?: OpsTimeRange;
}): Promise<OperationsSnapshotDTO> {
  const range = options?.range ?? "7d";
  const [
    settings,
    health,
    suppliers,
    orders,
    payments,
    products,
    notifications,
    activity,
    kpi,
    pipeline,
    recentOrders,
    jobs,
  ] = await Promise.all([
    getStoreSettings(),
    runCoreHealthChecks(),
    listSupplierCards(),
    getOrdersMetrics(),
    getPaymentsMetrics(),
    getProductsMetrics(),
    getNotificationsMetrics(),
    getRecentActivity(),
    getOpsKpi(range),
    getOrderPipeline(),
    getRecentOrdersForOps(),
    getJobsStatus(),
  ]);

  const generatedAt = new Date().toISOString();
  const ordersEnabled = isOrderingEnabled(settings);
  const maintenanceEnabled = settings.maintenance.enabled;

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

  const wallets = getWalletFloat(suppliers);
  const systemStatus = buildSystemStatus({
    ordersEnabled,
    maintenanceEnabled,
    suppliers,
    health,
    activeMethods: payments.activeMethods,
    misconfiguredCount: payments.misconfiguredMethods.length,
  });

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;

  return {
    generatedAt,
    greetingName: (options?.adminName ?? "").trim().split(/\s+/)[0] || "Admin",
    environmentLabel: runtimeEnvLabel(),
    version: sha ? sha.slice(0, 7) : "local",
    maintenanceEnabled,
    ordersEnabled,
    overallStatus: systemStatus.overall,
    announcement: buildAnnouncement({ ordersEnabled, maintenanceEnabled, settings }),
    systemStatus,
    kpi,
    pipeline,
    recentOrders,
    wallets,
    jobs,
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

function supplierRollup(suppliers: SupplierCardDTO[]): OpsHealthStatus {
  const usable = suppliers.filter((s) => s.configured);
  return rollUpHealth(
    usable.map((s) => ({
      status: (s.health === "offline"
        ? "offline"
        : s.health === "warning"
          ? "warning"
          : s.health === "healthy"
            ? "healthy"
            : "unknown") as OpsHealthStatus,
    })),
  );
}

function buildSystemStatus(input: {
  ordersEnabled: boolean;
  maintenanceEnabled: boolean;
  suppliers: SupplierCardDTO[];
  health: { key: string; status: OpsHealthStatus }[];
  activeMethods: number;
  misconfiguredCount: number;
}): OpsSystemStatusDTO {
  const supplierStatus = supplierRollup(input.suppliers);
  const blockedSuppliers = input.suppliers.filter(
    (s) => s.configured && s.health === "offline",
  ).length;
  const emailHealth = input.health.find((h) => h.key === "email")?.status ?? "unknown";

  const checkout: OpsStatusChipDTO = input.maintenanceEnabled
    ? { key: "checkout", label: "Boutique", sub: "En maintenance", status: "offline" }
    : input.ordersEnabled
      ? { key: "checkout", label: "Paiement", sub: "Ouvert", status: "healthy" }
      : { key: "checkout", label: "Paiement", sub: "Suspendu (pré-lancement)", status: "warning" };

  const payments: OpsStatusChipDTO = {
    key: "payments",
    label: "Paiements",
    sub:
      input.misconfiguredCount > 0
        ? `${input.misconfiguredCount} mal configuré(s)`
        : `${input.activeMethods} moyens · manuel`,
    status: input.misconfiguredCount > 0 ? "warning" : "healthy",
  };

  const suppliers: OpsStatusChipDTO = {
    key: "suppliers",
    label: "Fournisseurs",
    sub:
      blockedSuppliers > 0
        ? `${blockedSuppliers} bloqué(s)`
        : supplierStatus === "healthy"
          ? "Opérationnels"
          : "À vérifier",
    status: supplierStatus,
  };

  const email: OpsStatusChipDTO = {
    key: "email",
    label: "E-mails",
    sub: emailHealth === "healthy" ? "Distribution OK" : "À surveiller",
    status: emailHealth,
  };

  const chips = [checkout, payments, suppliers, email];
  const overall = rollUpHealth(chips.map((c) => ({ status: c.status })));

  // Headline: lead with the most operator-relevant fact.
  const parts: string[] = [];
  if (input.maintenanceEnabled) parts.push("Boutique en maintenance");
  else if (!input.ordersEnabled) parts.push("Paiement suspendu");
  else parts.push("Boutique ouverte");
  if (blockedSuppliers > 0)
    parts.push(`${blockedSuppliers} problème(s) fournisseur`);

  return { headline: parts.join(" · "), overall, chips };
}

function buildAnnouncement(input: {
  ordersEnabled: boolean;
  maintenanceEnabled: boolean;
  settings: { maintenance: { message: string } };
}): OpsAnnouncementDTO | null {
  if (input.maintenanceEnabled) {
    return {
      message:
        input.settings.maintenance.message?.trim() ||
        "La boutique est en mode maintenance — les clients voient une page d’indisponibilité.",
      tone: "warn",
    };
  }
  if (!input.ordersEnabled) {
    return {
      message:
        "Boutique en pré-lancement — le paiement est volontairement suspendu le temps de finaliser les fournisseurs et la vérification des paiements.",
      tone: "info",
    };
  }
  return null;
}
