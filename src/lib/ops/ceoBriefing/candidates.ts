/**
 * Deterministic candidate-issue detection for the CEO Briefing.
 *
 * PURE and client-safe. Turns the operations snapshot (plus a couple of extra
 * counts) into a severity-ranked list of candidate issues. Severity and the
 * facts are decided here in code — the AI may reorder/reword among candidates
 * but can never invent an issue or lower a genuine critical.
 *
 * Priority order mirrors the spec: security/data → blocked paid order → supplier
 * outage/critical balance → payment provider failure → fulfilment failure →
 * urgent support → checkout misconfiguration → launch blocker → operational
 * warnings → growth opportunity → healthy.
 */

import type { OperationsSnapshotDTO, SupplierCardDTO } from "@/lib/dto";
import type { CandidateExtras, CandidateIssue, CandidateType, IssueSeverity } from "./types";

export type { CandidateExtras };

/** Wallet balance thresholds — mirrors DEFAULT_BALANCE_THRESHOLDS in warnings.ts. */
const BALANCE_THRESHOLDS = { critical: 20, warning: 50 };

/** Lower rank = higher priority. */
const PRIORITY_RANK: Record<CandidateType, number> = {
  SYSTEM_HEALTH: 10,
  FAILED_PURCHASES: 20,
  ORDERS_PAYMENT_ISSUE: 25,
  SUPPLIER_OFFLINE: 30,
  SUPPLIER_BALANCE_CRITICAL: 35,
  PAYMENT_PROVIDER_WARNING: 40,
  ORDERS_STUCK: 50,
  SUPPORT_BACKLOG: 70,
  PAYMENT_MISCONFIGURED: 80,
  LAUNCH_BLOCKER: 90,
  PAYMENT_REVIEW_BACKLOG: 100,
  EMAIL_FAILURES: 101,
  PRODUCTS_COVERAGE: 102,
  SUPPLIER_BALANCE_LOW: 103,
  GROWTH_OPPORTUNITY: 110,
  HEALTHY: 120,
};

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  opportunity: 3,
  healthy: 4,
};

function liveSuppliers(snapshot: OperationsSnapshotDTO): SupplierCardDTO[] {
  return snapshot.suppliers.filter((s) => s.enabled && s.configured);
}

/** The most severe candidate for a single supplier (offline > critical > low). */
function supplierCandidate(s: SupplierCardDTO, atRisk: number): CandidateIssue | null {
  if (s.health === "offline") {
    return {
      type: "SUPPLIER_OFFLINE",
      severity: "critical",
      title: `${s.name} hors service`,
      description: `Le fournisseur ${s.name} ne répond pas — les livraisons automatiques via ce fournisseur sont bloquées.`,
      count: atRisk,
      allowedActionIds: ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"],
      supplierSlug: s.slug,
      metrics: { atRiskOrders: atRisk },
    };
  }
  if (s.supportsBalance && s.balance) {
    const amt = Number.parseFloat(s.balance.amount);
    const cur = s.balance.currency;
    if (Number.isFinite(amt) && amt <= BALANCE_THRESHOLDS.critical) {
      return {
        type: "SUPPLIER_BALANCE_CRITICAL",
        severity: "critical",
        title: `Solde ${s.name} critique`,
        description: `Solde ${amt} ${cur} — sous le seuil critique (${BALANCE_THRESHOLDS.critical} ${cur}). Rechargez le portefeuille pour ne pas bloquer les livraisons.`,
        count: atRisk,
        allowedActionIds: ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"],
        supplierSlug: s.slug,
        metrics: { balance: amt, currency: cur, atRiskOrders: atRisk },
      };
    }
    if (Number.isFinite(amt) && amt <= BALANCE_THRESHOLDS.warning) {
      return {
        type: "SUPPLIER_BALANCE_LOW",
        severity: "medium",
        title: `Solde ${s.name} faible`,
        description: `Solde ${amt} ${cur} — sous ${BALANCE_THRESHOLDS.warning} ${cur}. Pensez à recharger prochainement.`,
        count: 0,
        allowedActionIds: ["OPEN_SUPPLIER_DETAIL", "OPEN_SUPPLIERS"],
        supplierSlug: s.slug,
        metrics: { balance: amt, currency: cur },
      };
    }
  }
  return null;
}

/**
 * Compute every eligible candidate issue from the snapshot. Deterministic.
 * Always returns at least one candidate (HEALTHY when nothing else fires).
 */
export function computeCandidates(snapshot: OperationsSnapshotDTO, extras: CandidateExtras): CandidateIssue[] {
  const out: CandidateIssue[] = [];
  const orders = snapshot.orders;
  const atRisk = orders.readyForFulfillment; // paid, awaiting fulfilment → at risk if a supplier is down

  // 1 · System health — offline core checks (database/auth/website/storage).
  const offlineCore = snapshot.health.filter(
    (h) => h.status === "offline" && ["database", "auth", "website", "storage"].includes(h.key),
  );
  if (offlineCore.length > 0) {
    out.push({
      type: "SYSTEM_HEALTH",
      severity: "critical",
      title: "Incident système détecté",
      description: `${offlineCore.map((h) => h.label).join(", ")} hors service — vérifiez l'état du système.`,
      count: offlineCore.length,
      allowedActionIds: ["OPEN_ACTIVITY", "OPEN_OVERVIEW"],
      metrics: { offlineChecks: offlineCore.length },
    });
  }

  // 2 · Blocked paid orders / fulfilment failures.
  if (orders.recentFailedPurchases > 0) {
    out.push({
      type: "FAILED_PURCHASES",
      severity: "high",
      title: "Livraisons automatiques en échec",
      description: `${orders.recentFailedPurchases} achat(s) fournisseur ont échoué récemment — des commandes payées attendent une livraison manuelle.`,
      count: orders.recentFailedPurchases,
      allowedActionIds: ["OPEN_ORDERS", "OPEN_SUPPLIERS"],
      metrics: { failedPurchases: orders.recentFailedPurchases },
    });
  }
  if (orders.paymentIssue > 0) {
    out.push({
      type: "ORDERS_PAYMENT_ISSUE",
      severity: "high",
      title: "Commandes avec un problème de paiement",
      description: `${orders.paymentIssue} commande(s) sont en anomalie de paiement et nécessitent une vérification.`,
      count: orders.paymentIssue,
      allowedActionIds: ["OPEN_ORDERS"],
      metrics: { paymentIssue: orders.paymentIssue },
    });
  }

  // 3 · Suppliers (offline / critical / low balance) — one candidate per supplier.
  for (const s of liveSuppliers(snapshot)) {
    const c = supplierCandidate(s, atRisk);
    if (c) out.push(c);
  }

  // 4 · Payment provider warning (e.g. PAYPAL_ENV=live hors prod) — from health.
  const payHealth = snapshot.health.find((h) => h.key === "payments");
  if (payHealth && (payHealth.status === "offline" || payHealth.status === "warning")) {
    out.push({
      type: "PAYMENT_PROVIDER_WARNING",
      severity: payHealth.status === "offline" ? "high" : "medium",
      title: "Avertissement fournisseur de paiement",
      description: payHealth.message || "Un fournisseur de paiement signale un problème de configuration.",
      count: 0,
      allowedActionIds: ["OPEN_PAYMENT_SETTINGS"],
    });
  }

  // 5 · Orders stuck in review past SLA.
  if (orders.waitingTooLong > 0) {
    out.push({
      type: "ORDERS_STUCK",
      severity: "high",
      title: "Paiements en attente depuis trop longtemps",
      description: `${orders.waitingTooLong} paiement(s) soumis attendent une vérification au-delà du délai habituel.`,
      count: orders.waitingTooLong,
      allowedActionIds: ["OPEN_PAYMENT_REVIEW", "OPEN_ORDERS"],
      metrics: { waitingTooLong: orders.waitingTooLong },
    });
  }

  // 6 · Support backlog (open tickets).
  if (extras.supportOpen > 0) {
    out.push({
      type: "SUPPORT_BACKLOG",
      severity: "medium",
      title: "Tickets de support ouverts",
      description: `${extras.supportOpen} ticket(s) de support en attente de réponse.`,
      count: extras.supportOpen,
      allowedActionIds: ["OPEN_SUPPORT"],
      metrics: { openTickets: extras.supportOpen },
    });
  }

  // 7 · Payment methods misconfigured (blocks checkout).
  const misconfigured = snapshot.payments.misconfiguredMethods.length;
  if (misconfigured > 0) {
    out.push({
      type: "PAYMENT_MISCONFIGURED",
      severity: "high",
      title: `${misconfigured} moyen(s) de paiement mal configuré(s)`,
      description: "Un moyen de paiement actif est incomplet — les clients pourraient être bloqués au moment de payer.",
      count: misconfigured,
      allowedActionIds: ["OPEN_PAYMENT_SETTINGS"],
      metrics: { misconfigured },
    });
  }

  // 8 · Payment review backlog.
  if (snapshot.payments.awaitingReview > 0) {
    out.push({
      type: "PAYMENT_REVIEW_BACKLOG",
      severity: "medium",
      title: "Paiements à vérifier",
      description: `${snapshot.payments.awaitingReview} paiement(s) en attente de revue.`,
      count: snapshot.payments.awaitingReview,
      allowedActionIds: ["OPEN_PAYMENT_REVIEW"],
      metrics: { awaitingReview: snapshot.payments.awaitingReview },
    });
  }

  // 9 · Email failures.
  if (snapshot.notifications.emailFailures24h >= 3) {
    out.push({
      type: "EMAIL_FAILURES",
      severity: "medium",
      title: "Échecs d'envoi d'e-mails",
      description: `${snapshot.notifications.emailFailures24h} e-mail(s) n'ont pas pu être envoyés sur les dernières 24 h.`,
      count: snapshot.notifications.emailFailures24h,
      allowedActionIds: ["OPEN_EMAIL_HEALTH"],
      metrics: { emailFailures24h: snapshot.notifications.emailFailures24h },
    });
  }

  // 10 · Catalog coverage.
  if (snapshot.products.missingSupplyRoute > 0) {
    out.push({
      type: "PRODUCTS_COVERAGE",
      severity: "medium",
      title: "Produits sans source d'approvisionnement",
      description: `${snapshot.products.missingSupplyRoute} produit(s) actif(s) n'ont pas de route de livraison configurée.`,
      count: snapshot.products.missingSupplyRoute,
      allowedActionIds: ["OPEN_PRODUCTS"],
      metrics: { missingSupplyRoute: snapshot.products.missingSupplyRoute },
    });
  }

  // 11 · Launch blocker — store not yet open to the public.
  if (!snapshot.ordersEnabled) {
    const blockers = misconfigured + offlineCore.length + liveSuppliers(snapshot).filter((s) => s.health === "offline").length;
    out.push({
      type: "LAUNCH_BLOCKER",
      severity: blockers > 0 ? "high" : "medium",
      title: "Ghost.ma n'est pas encore ouvert au public",
      description:
        blockers > 0
          ? "Les commandes sont désactivées et quelques réglages restent à finaliser avant l'ouverture."
          : "Les commandes sont désactivées. Lancez un test d'exécution puis ouvrez la boutique quand vous êtes prêt.",
      count: blockers,
      allowedActionIds: ["OPEN_FULFILLMENT_TEST", "OPEN_PAYMENT_SETTINGS"],
      metrics: { remainingBlockers: blockers },
    });
  }

  // If nothing above fired, offer a growth nudge (only on a clearly positive
  // revenue trend) or a healthy summary. Never fabricated — trend comes from KPI.
  const hasIssue = out.some((c) => c.severity === "critical" || c.severity === "high" || c.severity === "medium");
  if (!hasIssue) {
    const revenueTile = snapshot.kpi.tiles[0];
    const positiveTrend = revenueTile?.tone === "good";
    if (snapshot.ordersEnabled && positiveTrend) {
      out.push({
        type: "GROWTH_OPPORTUNITY",
        severity: "opportunity",
        title: "L'activité est en hausse",
        description: `${revenueTile.trendLabel}. C'est un bon moment pour mettre en avant vos meilleures ventes.`,
        count: 0,
        allowedActionIds: ["OPEN_PRODUCTS", "OPEN_ACTIVITY"],
      });
    }
    out.push({
      type: "HEALTHY",
      severity: "healthy",
      title: "Tout fonctionne normalement",
      description: "Aucun incident urgent. Les paiements, fournisseurs et livraisons sont opérationnels.",
      count: 0,
      allowedActionIds: ["OPEN_ACTIVITY", "OPEN_FULFILLMENT_TEST"],
    });
  }

  return out;
}

/** Sort candidates by deterministic priority (rank, then severity, then count). */
export function sortCandidates(candidates: CandidateIssue[]): CandidateIssue[] {
  return [...candidates].sort((a, b) => {
    const r = PRIORITY_RANK[a.type] - PRIORITY_RANK[b.type];
    if (r !== 0) return r;
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return b.count - a.count;
  });
}

/** The single highest-priority candidate. `candidates` must be non-empty. */
export function pickTopCandidate(candidates: CandidateIssue[]): CandidateIssue {
  return sortCandidates(candidates)[0];
}

/** True when at least one candidate is a genuine critical (AI may not downgrade). */
export function hasCritical(candidates: CandidateIssue[]): boolean {
  return candidates.some((c) => c.severity === "critical");
}

/**
 * Stable, dependency-free hash of the MATERIAL facts (type + severity + count of
 * each candidate). Two snapshots with the same operational picture hash equal, so
 * we don't spend on the AI when nothing meaningful changed. djb2 — deterministic,
 * no Date/crypto, safe in the client bundle.
 *
 * SUPPORT_BACKLOG is excluded: it comes from an extra count the client's live
 * snapshot doesn't carry, so including it would make the client's staleness
 * check disagree with the server. Support changes still refresh on TTL/reload.
 */
export function materialFactsHash(candidates: CandidateIssue[]): string {
  const canonical = sortCandidates(candidates)
    .filter((c) => c.type !== "SUPPORT_BACKLOG")
    .map((c) => `${c.type}:${c.severity}:${c.count}:${c.supplierSlug ?? ""}`)
    .join("|");
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) + h + canonical.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}
