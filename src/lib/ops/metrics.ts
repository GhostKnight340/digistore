/**
 * Operational metrics aggregation — real counts pulled straight from the DB
 * for the Operations dashboard. No fabricated numbers: every figure is a query
 * result. All reads run in parallel and are bounded so the page stays fast
 * even when opened frequently.
 */
import "server-only";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { getStoreSettings } from "@/lib/db/catalog";
import { isInventoryEnabled } from "@/lib/storeSettings";
import { getProductSupplySummaries } from "@/lib/db/variantMappings";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";

/** Orders sitting in "proof submitted" longer than this need attention. */
const REVIEW_SLA_HOURS = 12;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type OrdersMetrics = {
  pendingPayment: number;
  paymentSubmitted: number;
  readyForFulfillment: number;
  paymentIssue: number;
  deliveredToday: number;
  cancelledToday: number;
  rejectedToday: number;
  /** payment_submitted older than the review SLA. */
  waitingTooLong: number;
  recentFailedPurchases: number;
  newest: { id: string; label: string; status: string; createdAt: string }[];
};

export async function getOrdersMetrics(): Promise<OrdersMetrics> {
  const today = startOfToday();
  const slaCutoff = new Date(Date.now() - REVIEW_SLA_HOURS * 60 * 60 * 1000);
  const [
    pendingPayment,
    paymentSubmitted,
    readyForFulfillment,
    paymentIssue,
    deliveredToday,
    cancelledToday,
    rejectedToday,
    waitingTooLong,
    recentFailedPurchases,
    newestRows,
  ] = await Promise.all([
    prisma.order.count({ where: { status: "pending_payment" } }),
    prisma.order.count({ where: { status: "payment_submitted" } }),
    prisma.order.count({ where: { status: "payment_confirmed" } }),
    prisma.order.count({ where: { status: "payment_issue" } }),
    prisma.order.count({ where: { status: "delivered", updatedAt: { gte: today } } }),
    prisma.order.count({ where: { status: "cancelled", updatedAt: { gte: today } } }),
    prisma.order.count({ where: { status: "rejected", updatedAt: { gte: today } } }),
    prisma.order.count({ where: { status: "payment_submitted", createdAt: { lt: slaCutoff } } }),
    prisma.supplierLog.count({
      where: { requestType: "purchase", ok: false, createdAt: { gte: today } },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, orderNumber: true, customerName: true, status: true, createdAt: true },
    }),
  ]);

  return {
    pendingPayment,
    paymentSubmitted,
    readyForFulfillment,
    paymentIssue,
    deliveredToday,
    cancelledToday,
    rejectedToday,
    waitingTooLong,
    recentFailedPurchases,
    newest: newestRows.map((row) => ({
      id: row.id,
      label: `#${String(row.orderNumber).padStart(6, "0")} · ${row.customerName}`,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type PaymentsMetrics = {
  activeMethods: number;
  disabledMethods: number;
  awaitingReview: number;
  confirmedToday: number;
  rejectedToday: number;
  /** Average minutes from proof submission to confirmation over the last 7 days. */
  avgConfirmationMinutes: number | null;
  /** Methods that are visible/active but structurally incomplete. */
  misconfiguredMethods: { id: string; name: string; reason: string }[];
};

export async function getPaymentsMetrics(): Promise<PaymentsMetrics> {
  const today = startOfToday();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [{ methods }, awaitingReview, confirmedEvents, rejectedEvents, confirmedOrders] =
    await Promise.all([
      getAdminPaymentMethods(),
      prisma.order.count({ where: { status: "payment_submitted" } }),
      prisma.paymentEvent.count({
        where: { type: "status_change", toStatus: "payment_confirmed", createdAt: { gte: today } },
      }),
      prisma.paymentEvent.count({
        where: { type: "status_change", toStatus: "rejected", createdAt: { gte: today } },
      }),
      // Confirmation-time sample: orders confirmed in the last 7 days. Bounded
      // take keeps this cheap; we pair each with its proof-submitted event.
      prisma.order.findMany({
        where: { paymentConfirmedAt: { gte: weekAgo } },
        select: { id: true, paymentConfirmedAt: true },
        take: 200,
      }),
    ]);

  const activeMethods = methods.filter(
    (m) => m.status === "active" && m.visible && !m.archivedAt,
  ).length;
  const disabledMethods = methods.length - activeMethods;

  // Average confirmation time: diff each confirmed order against its earliest
  // proof-submitted event. One bounded query for all the submitted events.
  let avgConfirmationMinutes: number | null = null;
  if (confirmedOrders.length > 0) {
    const submittedEvents = await prisma.paymentEvent.findMany({
      where: {
        orderId: { in: confirmedOrders.map((o) => o.id) },
        toStatus: "payment_submitted",
      },
      select: { orderId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const firstSubmitted = new Map<string, Date>();
    for (const event of submittedEvents) {
      if (!firstSubmitted.has(event.orderId)) firstSubmitted.set(event.orderId, event.createdAt);
    }
    const durations: number[] = [];
    for (const order of confirmedOrders) {
      const submitted = firstSubmitted.get(order.id);
      if (submitted && order.paymentConfirmedAt) {
        const minutes = (order.paymentConfirmedAt.getTime() - submitted.getTime()) / 60000;
        if (minutes >= 0 && minutes < 60 * 24 * 30) durations.push(minutes);
      }
    }
    if (durations.length > 0) {
      avgConfirmationMinutes = Math.round(
        durations.reduce((sum, m) => sum + m, 0) / durations.length,
      );
    }
  }

  // A method is "misconfigured" when it's live to customers but missing the
  // details customers need to actually pay. Type-specific, structural only.
  const misconfiguredMethods = methods
    .filter((m) => m.status === "active" && m.visible && !m.archivedAt)
    .map((m) => {
      const d = m.details ?? {};
      let reason = "";
      if (m.type === "bank" && !d.fields?.length && !d.instructions) {
        reason = "Aucune coordonnée bancaire renseignée.";
      } else if (m.type === "paypal" && !d.instructions && !d.customLabel) {
        reason = "Aucune instruction PayPal renseignée.";
      } else if (m.type === "crypto" && !d.walletAddress) {
        reason = "Adresse de portefeuille manquante.";
      }
      return reason ? { id: m.id, name: m.name, reason } : null;
    })
    .filter((x): x is { id: string; name: string; reason: string } => x !== null);

  return {
    activeMethods,
    disabledMethods,
    awaitingReview,
    confirmedToday: confirmedEvents,
    rejectedToday: rejectedEvents,
    avgConfirmationMinutes,
    misconfiguredMethods,
  };
}

export type ProductsMetrics = {
  totalParents: number;
  hidden: number;
  missingSupplyRoute: number;
  incompleteMapping: number;
  manualOnly: number;
  missingImage: number;
  missingPrice: number;
  outOfStock: number | null;
};

export async function getProductsMetrics(): Promise<ProductsMetrics> {
  const settings = await getStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);
  const [totalParents, hidden, missingImage, missingPrice, supply, outOfStock] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: false } }),
    prisma.product.count({ where: { active: true, imageUrl: null } }),
    prisma.productVariant.count({ where: { active: true, priceMad: { lte: 0 } } }),
    getProductSupplySummaries(),
    inventoryOn
      ? prisma.productVariant.count({
          where: { active: true, stockControl: "manual", digitalCodes: { none: { status: "unused" } } },
        })
      : Promise.resolve(null),
  ]);

  let missingSupplyRoute = 0;
  let incompleteMapping = 0;
  let manualOnly = 0;
  for (const summary of Object.values(supply)) {
    if (summary === "none") missingSupplyRoute += 1;
    else if (summary === "incomplete") incompleteMapping += 1;
    else if (summary === "manual_only") manualOnly += 1;
  }

  return {
    totalParents,
    hidden,
    missingSupplyRoute,
    incompleteMapping,
    manualOnly,
    missingImage,
    missingPrice,
    outOfStock,
  };
}

export type NotificationsMetrics = {
  emailFailures24h: number;
  discordFailures24h: number;
  supplierFailures24h: number;
  recentEmailErrors: { id: string; recipient: string; message: string; at: string }[];
};

export async function getNotificationsMetrics(): Promise<NotificationsMetrics> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [emailFailures24h, discordFailures24h, supplierFailures24h, recentEmailErrors] =
    await Promise.all([
      prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
      prisma.order.count({
        where: { discordDeliveryStatus: "FAILED", discordDeliveryAttemptedAt: { gte: since } },
      }),
      prisma.supplierLog.count({ where: { ok: false, createdAt: { gte: since } } }),
      prisma.emailLog.findMany({
        where: { status: "failed", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, recipient: true, errorMessage: true, type: true, createdAt: true },
      }),
    ]);
  return {
    emailFailures24h,
    discordFailures24h,
    supplierFailures24h,
    recentEmailErrors: recentEmailErrors.map((row) => ({
      id: row.id,
      recipient: row.recipient,
      message: row.errorMessage || `Échec d’envoi (${row.type}).`,
      at: row.createdAt.toISOString(),
    })),
  };
}

export type ActivityItem = {
  id: string;
  kind: "order" | "payment" | "supplier" | "email";
  title: string;
  detail: string;
  at: string;
  href?: string;
};

/**
 * Merged, newest-first operational events from four sources (orders, payment
 * status changes, supplier calls, email failures). `perSource` bounds each
 * query so the merge stays cheap; the caller slices/filters/paginates. Shared
 * by the dashboard feed (small window) and the full activity log (large window).
 */
export async function fetchActivityWindow(perSource: number): Promise<ActivityItem[]> {
  const [orders, payments, supplierLogs, emailFails] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, orderNumber: true, customerName: true, createdAt: true },
    }),
    prisma.paymentEvent.findMany({
      where: { type: "status_change" },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, orderId: true, toStatus: true, createdAt: true },
    }),
    prisma.supplierLog.findMany({
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: {
        id: true,
        supplierId: true,
        requestType: true,
        ok: true,
        productName: true,
        orderId: true,
        createdAt: true,
      },
    }),
    prisma.emailLog.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: perSource,
      select: { id: true, recipient: true, type: true, createdAt: true },
    }),
  ]);

  const items: ActivityItem[] = [
    ...orders.map((o) => ({
      id: `order-${o.id}`,
      kind: "order" as const,
      title: `Commande #${String(o.orderNumber).padStart(6, "0")} créée`,
      detail: o.customerName,
      at: o.createdAt.toISOString(),
      href: `/admin/orders/${o.id}`,
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "payment" as const,
      title: paymentEventTitle(p.toStatus),
      detail: "",
      at: p.createdAt.toISOString(),
      href: `/admin/orders/${p.orderId}`,
    })),
    ...supplierLogs.map((s) => ({
      id: `sup-${s.id}`,
      kind: "supplier" as const,
      title: supplierLogTitle(s.supplierId, s.requestType, s.ok),
      detail: s.productName ?? "",
      at: s.createdAt.toISOString(),
      href: s.orderId ? `/admin/orders/${s.orderId}` : `/admin/suppliers/${s.supplierId}/logs`,
    })),
    ...emailFails.map((e) => ({
      id: `mail-${e.id}`,
      kind: "email" as const,
      title: "Échec d’envoi d’e-mail",
      detail: e.recipient,
      at: e.createdAt.toISOString(),
    })),
  ];

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Small newest-first feed for the dashboard card. */
export async function getRecentActivity(limit = 25): Promise<ActivityItem[]> {
  const items = await fetchActivityWindow(Math.max(8, Math.ceil(limit / 2)));
  return items.slice(0, limit);
}

function paymentEventTitle(toStatus: string | null): string {
  switch (toStatus) {
    case "payment_submitted":
      return "Preuve de paiement soumise";
    case "payment_confirmed":
      return "Paiement confirmé";
    case "rejected":
      return "Paiement refusé";
    case "payment_issue":
      return "Problème de paiement signalé";
    case "delivered":
      return "Commande livrée";
    case "cancelled":
      return "Commande annulée";
    default:
      return `Statut → ${toStatus ?? "?"}`;
  }
}

function supplierLogTitle(supplier: string, requestType: string, ok: boolean): string {
  const name = supplier.charAt(0).toUpperCase() + supplier.slice(1);
  if (requestType === "purchase") return `Achat ${name} ${ok ? "réussi" : "échoué"}`;
  if (requestType === "health_check") return `Test ${name} ${ok ? "réussi" : "échoué"}`;
  if (requestType === "balance") return `Solde ${name} ${ok ? "actualisé" : "indisponible"}`;
  return `${name} · ${requestType}`;
}
