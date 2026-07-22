/**
 * Builds the SANITIZED business snapshot handed to the AI model.
 *
 * PURE and client-safe. Only aggregate, non-sensitive facts cross the boundary:
 * NO customer names/emails/phones, NO gift-card codes, NO payment proofs, NO API
 * keys or supplier credentials, NO raw order rows. In particular it deliberately
 * omits the operations snapshot's `recentOrders`, `activity`, `wallets`, and
 * `notifications.recentEmailErrors` (which carry recipient emails). Counts and
 * short operational descriptions only.
 */

import type { OperationsSnapshotDTO } from "@/lib/dto";
import { sortCandidates } from "./candidates";
import type { BriefingAiPayload, CandidateExtras, CandidateIssue } from "./types";

function revenueHeadline(snapshot: OperationsSnapshotDTO): { headline: string; trend: string | null } {
  const tile = snapshot.kpi.tiles[0];
  if (!tile) return { headline: "—", trend: null };
  return { headline: `${tile.value} ${tile.unit}`.trim(), trend: tile.trendLabel || null };
}

/**
 * Assemble the model payload from the operations snapshot + a few extra counts +
 * the deterministic candidates. `candidates` is already computed by the caller.
 */
export function buildAiPayload(
  snapshot: OperationsSnapshotDTO,
  extras: CandidateExtras,
  candidates: CandidateIssue[],
  now: string,
): BriefingAiPayload {
  const payHealth = snapshot.health.find((h) => h.key === "payments");
  const emailHealth = snapshot.health.find((h) => h.key === "email");
  const revenue = revenueHeadline(snapshot);

  const sorted = sortCandidates(candidates);
  const allowedActionIds = Array.from(new Set(sorted.flatMap((c) => c.allowedActionIds)));

  return {
    generatedAt: now,
    environment: snapshot.environmentLabel,
    storeStatus: {
      ordersEnabled: snapshot.ordersEnabled,
      maintenanceEnabled: snapshot.maintenanceEnabled,
      launchMode: !snapshot.ordersEnabled,
      overallStatus: snapshot.overallStatus,
    },
    revenue,
    orders: {
      pendingPayment: snapshot.orders.pendingPayment,
      paymentSubmitted: snapshot.orders.paymentSubmitted,
      awaitingFulfillment: snapshot.orders.readyForFulfillment,
      paymentIssue: snapshot.orders.paymentIssue,
      deliveredToday: snapshot.orders.deliveredToday,
      waitingTooLong: snapshot.orders.waitingTooLong,
      recentFailedPurchases: snapshot.orders.recentFailedPurchases,
    },
    payments: {
      activeMethods: snapshot.payments.activeMethods,
      misconfiguredMethods: snapshot.payments.misconfiguredMethods.length,
      pendingReviews: snapshot.payments.awaitingReview,
      providerWarning:
        payHealth && (payHealth.status === "warning" || payHealth.status === "offline")
          ? payHealth.message || "warning"
          : null,
    },
    suppliers: snapshot.suppliers
      .filter((s) => s.enabled && s.configured)
      .map((s) => ({
        name: s.name,
        status: s.health,
        balance: s.balance ? Number.parseFloat(s.balance.amount) : null,
        currency: s.balance?.currency ?? null,
        recentFailedPurchases: s.recentPurchases.failed,
      })),
    support: { open: extras.supportOpen },
    email: {
      status: emailHealth?.status ?? "unknown",
      recentFailures: snapshot.notifications.emailFailures24h,
    },
    catalog: {
      active: Math.max(0, snapshot.products.totalParents - snapshot.products.hidden),
      coverageIssues: snapshot.products.missingSupplyRoute,
    },
    candidates: sorted.map((c) => ({
      type: c.type,
      severity: c.severity,
      title: c.title,
      description: c.description,
      count: c.count,
      allowedActionIds: c.allowedActionIds,
    })),
    allowedActionIds,
  };
}
