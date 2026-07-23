/**
 * Operations "control center" aggregations that back the redesigned dashboard:
 * time-ranged KPI snapshot, order pipeline, recent-orders queue, background
 * jobs, prepaid wallet float, and the system-status bar. Real queries only —
 * pre-launch shows honest "no data yet" states, never invented numbers.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { orderStatusLabel } from "@/lib/orderStatus";
import { CRON_JOBS, getJobRuns, isJobOverdue, type CronJob } from "./jobRuns";
import type {
  OpsKpiSnapshotDTO,
  OpsPipelineStageDTO,
  OpsRecentOrderDTO,
  OpsJobDTO,
  OpsWalletDTO,
  OpsHealthStatus,
} from "@/lib/dto";
import type { SupplierCardDTO } from "@/lib/dto";
import { DEFAULT_BALANCE_THRESHOLDS } from "./warnings";

export type OpsTimeRange = "today" | "7d" | "30d";

function rangeStart(range: OpsTimeRange): Date {
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const PAID_STATUSES = ["payment_confirmed", "delivered"];

/**
 * Revenue / orders / average order value / refund rate for the selected range.
 * Revenue counts only paid orders (confirmed or delivered). Empty states are
 * explicit so a pre-launch store never shows a fabricated figure.
 */
export async function getOpsKpi(range: OpsTimeRange): Promise<OpsKpiSnapshotDTO> {
  const since = rangeStart(range);
  const [ordersInRange, paid, refunded, revenue] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { createdAt: { gte: since }, status: { in: PAID_STATUSES } } }),
    prisma.order.count({ where: { createdAt: { gte: since }, status: "refunded" } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: since }, status: { in: PAID_STATUSES } },
      _sum: { totalMad: true },
    }),
  ]);

  const revenueMad = revenue._sum.totalMad ?? 0;
  const aov = paid > 0 ? Math.round(revenueMad / paid) : null;
  const refundBase = paid + refunded;
  const refundRate = refundBase > 0 ? Math.round((refunded / refundBase) * 1000) / 10 : null;
  const noTraffic = ordersInRange === 0;

  const rangeLabel = range === "today" ? "aujourd’hui" : range === "7d" ? "7 j" : "30 j";
  const fmt = (n: number) => n.toLocaleString("fr-FR");

  return {
    range,
    tiles: [
      {
        label: `Revenu · ${rangeLabel}`,
        value: fmt(revenueMad),
        unit: "MAD",
        trendLabel: noTraffic ? "Aucun trafic réel" : `${paid} commande(s) payée(s)`,
        tone: "neutral",
      },
      {
        label: `Commandes · ${rangeLabel}`,
        value: fmt(ordersInRange),
        unit: "",
        trendLabel: noTraffic ? "Pré-lancement" : `${paid} payée(s)`,
        tone: "neutral",
      },
      {
        label: "Panier moyen",
        value: aov != null ? fmt(aov) : "—",
        unit: aov != null ? "MAD" : "",
        trendLabel: aov != null ? "Sur commandes payées" : "Données insuffisantes",
        tone: "neutral",
      },
      {
        label: "Taux de remboursement",
        value: refundRate != null ? String(refundRate) : "—",
        unit: refundRate != null ? "%" : "",
        trendLabel: refundRate != null ? `${refunded} remboursement(s)` : "Aucun pour l’instant",
        tone: refundRate != null && refundRate > 5 ? "bad" : "good",
      },
    ],
  };
}

/** Six real pipeline stages by Order.status, newest queue first. Each links to
 *  the orders list. "Processing" is not a real status here, so the pipeline
 *  uses the actual state machine (issue instead). */
export async function getOrderPipeline(): Promise<OpsPipelineStageDTO[]> {
  const stages: { key: string; label: string; status: string; accent: string }[] = [
    { key: "pending_payment", label: "Nouvelles", status: "pending_payment", accent: "#3E7BFA" },
    { key: "payment_submitted", label: "À vérifier", status: "payment_submitted", accent: "#E8A838" },
    { key: "payment_issue", label: "Problème", status: "payment_issue", accent: "#E05C5C" },
    { key: "payment_confirmed", label: "À livrer", status: "payment_confirmed", accent: "#3E7BFA" },
    { key: "delivered", label: "Livrées", status: "delivered", accent: "#2EA067" },
    { key: "refunded", label: "Remboursement", status: "refunded", accent: "#646A77" },
  ];
  const counts = await Promise.all(
    stages.map((s) => prisma.order.count({ where: { status: s.status } })),
  );
  return stages.map((s, i) => ({
    key: s.key,
    label: s.label,
    count: counts[i],
    accent: s.accent,
    href: "/admin?tab=orders",
  }));
}

/** Latest orders with the inline action the operator would take next. */
export async function getRecentOrdersForOps(limit = 7): Promise<OpsRecentOrderDTO[]> {
  const rows = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      totalMad: true,
      items: {
        take: 1,
        select: { product: { select: { name: true } }, variant: { select: { name: true } } },
      },
      _count: { select: { items: true } },
    },
  });
  return rows.map((row) => {
    const first = row.items[0];
    const itemName = first
      ? `${first.product.name}${first.variant ? ` · ${first.variant.name}` : ""}`
      : "—";
    const extra = row._count.items > 1 ? ` +${row._count.items - 1}` : "";
    const action =
      row.status === "payment_submitted"
        ? "Vérifier"
        : row.status === "payment_confirmed"
          ? "Livrer"
          : "Ouvrir";
    return {
      id: row.id,
      orderNumber: `#${String(row.orderNumber).padStart(6, "0")}`,
      customer: row.customerName,
      item: `${itemName}${extra}`,
      amountMad: row.totalMad,
      status: row.status,
      statusLabel: orderStatusLabel(row.status),
      action,
    };
  });
}

/**
 * Background jobs strip — the REAL scheduled work, not invented supplier syncs.
 * Vercel crons from vercel.json + the outbound email queue health.
 */
const JOB_LABEL: Record<CronJob, string> = {
  expenses: "Cron dépenses",
  "expense-review": "Cron revue mensuelle",
  "ghost-credit": "Cron crédit Ghost",
  "supplier-reconcile": "Cron réconciliation fournisseurs",
  "supplier-health": "Cron santé fournisseurs",
  "stuck-orders": "Cron commandes bloquées",
  "ai-ops": "Cron AI Operations",
  "support-email": "Cron e-mails support",
  "instagram-publish": "Cron publications Instagram",
};

export async function getJobsStatus(): Promise<OpsJobDTO[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [emailFailed, runs] = await Promise.all([
    prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
    getJobRuns(),
  ]);
  const byJob = new Map(runs.map((run) => [run.job, run]));
  const onVercel = Boolean(process.env.VERCEL);

  // Every cron in vercel.json, reported from RECORDED EXECUTIONS rather than
  // from the mere fact of running on Vercel. The previous implementation
  // returned "healthy" whenever process.env.VERCEL was set — a green light
  // nobody earned, and one that directly contradicted checkCron in the same
  // dashboard. It also listed only 2 of the 5 jobs, silently omitting the
  // 10-minute supplier reconciliation that resolves money-at-stake fulfilment.
  const jobs: OpsJobDTO[] = CRON_JOBS.map((job) => {
    const run = byJob.get(job);
    const label = JOB_LABEL[job];

    if (!run || !run.lastSuccessAt) {
      return {
        name: label,
        detail: onVercel ? "aucune exécution enregistrée" : "hors Vercel",
        // Never run is NOT healthy, and it is not an error either — we simply
        // have no evidence. Say so.
        status: "unknown" as OpsHealthStatus,
      };
    }

    const overdue = isJobOverdue(job, run.lastSuccessAt);
    const failing = run.consecutiveFailures > 0;
    const ageHours = Math.floor((Date.now() - run.lastSuccessAt.getTime()) / 3_600_000);
    const detail = failing
      ? `${run.consecutiveFailures} échec(s) consécutif(s)`
      : overdue
        ? `dernier succès il y a ${ageHours} h — en retard`
        : `dernier succès il y a ${ageHours} h`;

    return {
      name: label,
      detail,
      status: (failing || overdue ? "warning" : "healthy") as OpsHealthStatus,
    };
  });

  jobs.push({
    name: "File e-mails",
    detail: emailFailed > 0 ? `${emailFailed} échec(s) 24 h` : "0 échec",
    status: emailFailed > 0 ? "warning" : "healthy",
  });

  return jobs;
}

/**
 * Prepaid wallet float from the cached supplier balances. Progress is measured
 * against the "info" threshold (a full bar = comfortably funded); tier drives
 * the color. No live provider calls — reuses the supplier card state.
 */
export function getWalletFloat(suppliers: SupplierCardDTO[]): OpsWalletDTO[] {
  const t = DEFAULT_BALANCE_THRESHOLDS;
  return suppliers
    .filter((s) => s.supportsBalance)
    .map((s) => {
      if (!s.balance) {
        return {
          slug: s.slug,
          name: `Portefeuille ${s.name}`,
          amount: s.configured ? "non chargé" : "non connecté",
          currency: "",
          pct: 0,
          tier: "unknown" as OpsHealthStatus,
        };
      }
      const amount = Number(s.balance.amount);
      const pct = Number.isFinite(amount) ? Math.max(0, Math.min(100, (amount / t.info) * 100)) : 0;
      const tier: OpsHealthStatus =
        !Number.isFinite(amount) || amount <= t.critical
          ? "offline"
          : amount <= t.warning
            ? "warning"
            : amount <= t.info
              ? "warning"
              : "healthy";
      return {
        slug: s.slug,
        name: `Portefeuille ${s.name}`,
        amount: `${s.balance.amount} ${s.balance.currency}`,
        currency: s.balance.currency,
        pct: Math.round(pct),
        tier,
      };
    });
}
