import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { getGhostCreditWallet } from "./ghostCredit";
import { computeQualifyingSpend } from "./milestones";
import { listSupportTicketsForCustomer } from "./supportTickets";
import { writeAuditLog } from "./adminAudit";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/auth";
import { formatPublicOrderNumber } from "@/lib/orderNumber";
import { maskPhone } from "@/lib/privacyMask";
import {
  CUSTOMER_STATUSES,
  type AdminCustomerListItemDTO,
  type AdminCustomerListResult,
  type CustomerListFilters,
  type CustomerOverviewDTO,
  type CustomerOrderRowDTO,
  type CustomerPaymentRowDTO,
  type CustomerLockedCreditDTO,
  type CustomerPromotionsDTO,
  type CustomerSecurityDTO,
  type CustomerStatus,
} from "@/lib/customerAdminDto";

// Order-status groupings. "Completed" mirrors the revenue statuses used by the
// milestone/promo engines so spend numbers stay consistent across the admin.
const COMPLETED_STATUSES = ["payment_confirmed", "delivered"];
const PENDING_STATUSES = ["pending_payment", "payment_submitted", "payment_issue"];
const CANCELLED_STATUSES = ["rejected", "refunded", "cancelled"];
const PROBLEM_STATUSES = new Set(["payment_issue", "rejected"]);

const PAGE_SIZE = 25;

function signupMethod(c: {
  googleId: string | null;
  discordId: string | null;
  passwordHash: string | null;
  authProvider: string | null;
}): string {
  if (c.googleId) return "Google";
  if (c.discordId) return "Discord";
  if (c.passwordHash) return "E-mail";
  return c.authProvider || "—";
}

function normalizeStatus(value: string): CustomerStatus {
  return (CUSTOMER_STATUSES as readonly string[]).includes(value)
    ? (value as CustomerStatus)
    : "active";
}

// ── Public order number (customer-scoped, no N+1) ────────────────────────────
// A public number is the order's global chronological position. We compute the
// map for just this customer's orders with one count-per-order (bounded by the
// customer's order count, which is small) — matching getAccountOrders.
async function publicNumbers(
  orders: { id: string; createdAt: Date }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    orders.map(async (o) => {
      const earlier = await prisma.order.count({
        where: {
          OR: [
            { createdAt: { lt: o.createdAt } },
            { createdAt: o.createdAt, id: { lt: o.id } },
          ],
        },
      });
      map.set(o.id, formatPublicOrderNumber(earlier + 1));
    }),
  );
  return map;
}

// ── Customer list (paginated, filtered, sorted) ──────────────────────────────

export async function listAdminCustomers(
  filters: CustomerListFilters,
): Promise<AdminCustomerListResult> {
  await ensureDatabaseReady();
  const page = Math.max(1, filters.page ?? 1);
  const sort = filters.sort ?? "newest";

  const where: Prisma.CustomerWhereInput = {};
  const and: Prisma.CustomerWhereInput[] = [];

  const query = (filters.query ?? "").trim();
  if (query) {
    const or: Prisma.CustomerWhereInput[] = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query } },
    ];
    // Order-number search: resolve "#123"/"123" to the owning customer.
    const seqMatch = query.match(/^#?(\d+)$/);
    if (seqMatch) {
      const seq = Number(seqMatch[1]);
      if (seq > 0) {
        const order = await prisma.order.findMany({
          orderBy: { createdAt: "asc" },
          skip: seq - 1,
          take: 1,
          select: { customerId: true },
        });
        const cid = order[0]?.customerId;
        if (cid) or.push({ id: cid });
      }
    }
    and.push({ OR: or });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.verified === "verified") and.push({ emailVerified: true });
  if (filters.verified === "unverified") and.push({ emailVerified: false });
  if (filters.orders === "has") and.push({ orders: { some: {} } });
  if (filters.orders === "none") and.push({ orders: { none: {} } });
  if (filters.ghostCredit === "has") and.push({ ghostCreditBalanceMad: { gt: 0 } });

  // Open support is stored on a non-relation column, so resolve the id set first.
  if (filters.openSupport === "has") {
    const rows = await prisma.supportTicket.groupBy({
      by: ["customerId"],
      where: { status: { not: "closed" }, customerId: { not: null } },
    });
    const ids = rows.map((r) => r.customerId).filter((v): v is string => Boolean(v));
    and.push({ id: { in: ids.length ? ids : ["__none__"] } });
  }

  if (and.length) where.AND = and;

  const total = await prisma.customer.count({ where });

  // Sort. highest_spend needs aggregation, handled separately below.
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ createdAt: "asc" }]
      : sort === "most_orders"
        ? [{ orders: { _count: "desc" } }, { createdAt: "desc" }]
        : sort === "recent_activity"
          ? [{ lastLoginAt: "desc" }, { updatedAt: "desc" }]
          : [{ createdAt: "desc" }];

  let rows;
  if (sort === "highest_spend") {
    // Aggregate completed spend per customer within the filtered set, order by
    // it, paginate. Bounded by a candidate cap to keep the aggregation cheap.
    const candidates = await prisma.customer.findMany({
      where,
      select: { id: true },
      take: 500,
    });
    const ids = candidates.map((c) => c.id);
    const spendRows = ids.length
      ? await prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: ids }, status: { in: COMPLETED_STATUSES } },
          _sum: { totalMad: true, ghostCreditAppliedMad: true },
        })
      : [];
    const spendById = new Map(
      spendRows.map((r) => [
        r.customerId as string,
        (r._sum.totalMad ?? 0) + (r._sum.ghostCreditAppliedMad ?? 0),
      ]),
    );
    const ordered = ids
      .slice()
      .sort((a, b) => (spendById.get(b) ?? 0) - (spendById.get(a) ?? 0))
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    rows = await prisma.customer.findMany({ where: { id: { in: ordered } } });
    // Preserve the spend order.
    const orderIndex = new Map(ordered.map((id, i) => [id, i]));
    rows.sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  } else {
    rows = await prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  }

  const pageIds = rows.map((r) => r.id);
  const [spendAgg, supportAgg] = await Promise.all([
    pageIds.length
      ? prisma.order.groupBy({
          by: ["customerId", "status"],
          where: { customerId: { in: pageIds } },
          _count: { _all: true },
          _sum: { totalMad: true, ghostCreditAppliedMad: true },
        })
      : Promise.resolve([]),
    pageIds.length
      ? prisma.supportTicket.groupBy({
          by: ["customerId"],
          where: { customerId: { in: pageIds }, status: { not: "closed" } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const completedSpend = new Map<string, number>();
  const orderCounts = new Map<string, number>();
  for (const r of spendAgg) {
    const cid = r.customerId as string;
    orderCounts.set(cid, (orderCounts.get(cid) ?? 0) + r._count._all);
    if (COMPLETED_STATUSES.includes(r.status)) {
      completedSpend.set(
        cid,
        (completedSpend.get(cid) ?? 0) +
          (r._sum.totalMad ?? 0) +
          (r._sum.ghostCreditAppliedMad ?? 0),
      );
    }
  }
  const openSupport = new Map(
    supportAgg.map((r) => [r.customerId as string, r._count._all]),
  );

  const items: AdminCustomerListItemDTO[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phoneMasked: maskPhone(c.phone),
    emailVerified: c.emailVerified,
    status: normalizeStatus(c.status),
    signupMethod: signupMethod(c),
    createdAt: c.createdAt.toISOString(),
    lastActivityAt: (c.lastLoginAt ?? c.updatedAt)?.toISOString() ?? null,
    orderCount: orderCounts.get(c.id) ?? 0,
    completedSpendMad: completedSpend.get(c.id) ?? 0,
    ghostCreditBalanceMad: c.ghostCreditBalanceMad,
    openSupportCount: openSupport.get(c.id) ?? 0,
    walletFrozen: c.walletFrozen,
  }));

  return { items, total, page, pageSize: PAGE_SIZE };
}

// ── Overview ─────────────────────────────────────────────────────────────────

export async function getCustomerOverview(
  customerId: string,
): Promise<CustomerOverviewDTO | null> {
  await ensureDatabaseReady();
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return null;

  const [statusAgg, completedSpend, lastOrder, wallet, tickets, items] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { customerId },
      _count: { _all: true },
    }),
    computeQualifyingSpend(prisma, customerId),
    prisma.order.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    getGhostCreditWallet(customerId),
    listSupportTicketsForCustomer(customerId, c.email),
    prisma.orderItem.findMany({
      where: { order: { customerId, status: { in: COMPLETED_STATUSES } } },
      select: {
        quantity: true,
        product: { select: { name: true, categoryRecord: { select: { name: true } } } },
      },
      take: 500,
    }),
  ]);

  let completedOrders = 0;
  let pendingOrders = 0;
  let cancelledOrRefunded = 0;
  for (const s of statusAgg) {
    if (COMPLETED_STATUSES.includes(s.status)) completedOrders += s._count._all;
    else if (PENDING_STATUSES.includes(s.status)) pendingOrders += s._count._all;
    else if (CANCELLED_STATUSES.includes(s.status)) cancelledOrRefunded += s._count._all;
  }

  // Top categories / products from completed order items.
  const catCount = new Map<string, number>();
  const prodCount = new Map<string, number>();
  for (const it of items) {
    const cat = it.product?.categoryRecord?.name ?? "";
    const prod = it.product?.name ?? "";
    if (cat) catCount.set(cat, (catCount.get(cat) ?? 0) + it.quantity);
    if (prod) prodCount.set(prod, (prodCount.get(prod) ?? 0) + it.quantity);
  }
  const topN = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

  const lockedMad = await lockedGhostCredit(customerId);
  const openTickets = tickets.filter((t) => t.status !== "closed").length;
  const unresolvedOrderIssues = statusAgg
    .filter((s) => PROBLEM_STATUSES.has(s.status))
    .reduce((sum, s) => sum + s._count._all, 0);

  return {
    identity: {
      id: c.id,
      name: c.name,
      email: c.email,
      phoneMasked: maskPhone(c.phone),
      hasPhone: Boolean(c.phone),
      emailVerified: c.emailVerified,
      signupMethod: signupMethod(c),
      preferredLanguage: c.preferredLanguage,
      createdAt: c.createdAt.toISOString(),
      lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
      lastActivityAt: (c.lastLoginAt ?? c.updatedAt)?.toISOString() ?? null,
      status: normalizeStatus(c.status),
      statusReason: c.statusReason,
      marketingConsent: c.marketingConsent,
    },
    commerce: {
      completedOrders,
      pendingOrders,
      cancelledOrRefundedOrders: cancelledOrRefunded,
      completedSpendMad: completedSpend,
      averageOrderValueMad: completedOrders > 0 ? Math.round(completedSpend / completedOrders) : 0,
      lastOrderAt: lastOrder?.createdAt.toISOString() ?? null,
      topCategories: topN(catCount),
      topProducts: topN(prodCount),
    },
    wallet: {
      availableMad: wallet.balanceMad,
      lockedMad,
      pendingMad: 0,
      expiresAt: wallet.expiresAt,
      lastQualifyingCreditAt: c.lastQualifyingCreditEarnedAt?.toISOString() ?? null,
      frozen: c.walletFrozen,
      frozenReason: c.walletFrozenReason,
    },
    support: {
      openTickets,
      lastInteractionAt: tickets[0]?.createdAt ?? null,
      unresolvedOrderIssues,
    },
  };
}

/** Ghost Credit currently reserved against still-pending orders. */
async function lockedGhostCredit(customerId: string): Promise<number> {
  const agg = await prisma.order.aggregate({
    where: {
      customerId,
      status: { in: PENDING_STATUSES },
      ghostCreditAppliedMad: { gt: 0 },
    },
    _sum: { ghostCreditAppliedMad: true },
  });
  return agg._sum.ghostCreditAppliedMad ?? 0;
}

// ── Tab loaders ──────────────────────────────────────────────────────────────

export async function getCustomerOrdersTab(
  customerId: string,
  filters: { status?: string; paymentMethod?: string } = {},
): Promise<CustomerOrderRowDTO[]> {
  await ensureDatabaseReady();
  const where: Prisma.OrderWhereInput = { customerId };
  if (filters.status) where.status = filters.status;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      totalMad: true,
      discountMad: true,
      ghostCreditAppliedMad: true,
      items: {
        select: { quantity: true, product: { select: { name: true } } },
      },
    },
  });
  const numbers = await publicNumbers(orders);
  return orders.map((o) => ({
    id: o.id,
    publicOrderNumber: numbers.get(o.id) ?? "",
    createdAt: o.createdAt.toISOString(),
    itemsSummary: o.items
      .map((it) => `${it.quantity}× ${it.product?.name ?? "Article"}`)
      .join(", "),
    totalMad: o.totalMad,
    discountMad: o.discountMad,
    ghostCreditAppliedMad: o.ghostCreditAppliedMad,
    externalPaidMad: o.totalMad,
    paymentMethod: o.paymentMethod,
    status: o.status,
    hasProblem: PROBLEM_STATUSES.has(o.status),
  }));
}

export async function getCustomerPaymentsTab(
  customerId: string,
): Promise<CustomerPaymentRowDTO[]> {
  await ensureDatabaseReady();
  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      totalMad: true,
      paymentProvider: true,
      paymentProviderCaptureId: true,
      paymentProviderStatus: true,
      paymentProviderAmount: true,
      paymentProviderCurrency: true,
      paymentConfirmedAt: true,
      paymentProof: { select: { id: true } },
    },
  });
  const numbers = await publicNumbers(orders);
  const { maskReference } = await import("@/lib/privacyMask");
  return orders.map((o) => ({
    orderId: o.id,
    publicOrderNumber: numbers.get(o.id) ?? "",
    paymentMethod: o.paymentMethod,
    amountDueMad: o.totalMad,
    amountReceivedMad:
      o.paymentProviderAmount != null ? Math.round(o.paymentProviderAmount) : null,
    currency: o.paymentProviderCurrency ?? "MAD",
    hasProof: Boolean(o.paymentProof),
    providerReferenceMasked: maskReference(o.paymentProviderCaptureId),
    verificationState: o.paymentProviderStatus ?? (o.paymentConfirmedAt ? "confirmed" : "—"),
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function getCustomerGhostCreditTab(customerId: string): Promise<{
  wallet: Awaited<ReturnType<typeof getGhostCreditWallet>>;
  locked: CustomerLockedCreditDTO[];
  reminderEnabled: boolean;
  lastQualifyingCreditAt: string | null;
}> {
  await ensureDatabaseReady();
  const [wallet, customer, pendingOrders] = await Promise.all([
    getGhostCreditWallet(customerId),
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { expirationReminderEnabled: true, lastQualifyingCreditEarnedAt: true },
    }),
    prisma.order.findMany({
      where: {
        customerId,
        status: { in: PENDING_STATUSES },
        ghostCreditAppliedMad: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, status: true, ghostCreditAppliedMad: true },
    }),
  ]);
  const numbers = await publicNumbers(pendingOrders);
  const locked: CustomerLockedCreditDTO[] = pendingOrders.map((o) => ({
    orderId: o.id,
    publicOrderNumber: numbers.get(o.id) ?? "",
    amountMad: o.ghostCreditAppliedMad,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    autoExpiresAt: null,
  }));
  return {
    wallet,
    locked,
    reminderEnabled: customer?.expirationReminderEnabled ?? false,
    lastQualifyingCreditAt: customer?.lastQualifyingCreditEarnedAt?.toISOString() ?? null,
  };
}

export async function getCustomerPromotionsTab(
  customerId: string,
): Promise<CustomerPromotionsDTO> {
  await ensureDatabaseReady();
  const [redemptions, grants, qualifyingSpend, milestones] = await Promise.all([
    prisma.promoRedemption.findMany({
      where: { customerId },
      orderBy: { id: "desc" },
      take: 100,
      select: {
        status: true,
        promoCode: { select: { code: true, rewardType: true } },
        order: { select: { id: true, createdAt: true } },
      },
    }),
    prisma.spendingMilestoneGrant.findMany({
      where: { customerId },
      orderBy: { id: "desc" },
      select: {
        thresholdMad: true,
        rewardMad: true,
        status: true,
        milestone: { select: { publicTitle: true } },
      },
    }),
    computeQualifyingSpend(prisma, customerId),
    prisma.spendingMilestone.findMany({
      where: { active: true, archivedAt: null },
      orderBy: { thresholdMad: "asc" },
      select: { publicTitle: true, thresholdMad: true, rewardMad: true },
    }),
  ]);

  const orderNumbers = await publicNumbers(
    redemptions
      .map((r) => r.order)
      .filter((o): o is { id: string; createdAt: Date } => Boolean(o)),
  );

  const next = milestones.find((m) => m.thresholdMad > qualifyingSpend) ?? null;

  return {
    promos: redemptions.map((r) => ({
      code: r.promoCode?.code ?? "—",
      rewardType: r.promoCode?.rewardType ?? "—",
      orderNumber: r.order ? (orderNumbers.get(r.order.id) ?? null) : null,
      amountMad: 0,
      status: r.status,
      reversed: r.status === "released",
      createdAt: r.order?.createdAt.toISOString() ?? "",
    })),
    milestones: {
      qualifyingSpendMad: qualifyingSpend,
      unlocked: grants.map((g) => ({
        title: g.milestone?.publicTitle ?? "Palier",
        thresholdMad: g.thresholdMad,
        rewardMad: g.rewardMad,
        status: g.status,
        grantedAt: "",
      })),
      next: next
        ? {
            title: next.publicTitle,
            thresholdMad: next.thresholdMad,
            remainingMad: Math.max(0, next.thresholdMad - qualifyingSpend),
          }
        : null,
    },
  };
}

export async function getCustomerSupportTab(
  customerId: string,
  accountEmail?: string | null,
): Promise<import("@/lib/customerAdminDto").CustomerSupportTicketDTO[]> {
  await ensureDatabaseReady();
  const email = accountEmail?.trim();
  const where: Prisma.SupportTicketWhereInput = email
    ? { OR: [{ customerId }, { email: { equals: email, mode: "insensitive" } }] }
    : { customerId };
  const rows = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      reference: true,
      category: true,
      subIssueLabel: true,
      orderRef: true,
      status: true,
      resolution: true,
      message: true,
      replies: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((t) => {
    const replies = Array.isArray(t.replies) ? (t.replies as { body?: string }[]) : [];
    const latest = replies.length ? replies[replies.length - 1]?.body : t.message;
    return {
      id: t.id,
      reference: t.reference,
      category: t.category,
      subIssueLabel: t.subIssueLabel,
      orderRef: t.orderRef,
      status: t.status,
      resolution: t.resolution,
      latestMessage: (latest ?? "").slice(0, 240),
      replyCount: replies.length,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  });
}

export async function getCustomerSecurityTab(
  customerId: string,
): Promise<CustomerSecurityDTO | null> {
  await ensureDatabaseReady();
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) return null;
  const providers: string[] = [];
  if (c.passwordHash) providers.push("Mot de passe");
  if (c.googleId) providers.push("Google");
  if (c.discordId) providers.push("Discord");

  const events: { label: string; at: string }[] = [];
  if (c.lastLoginAt) events.push({ label: "Dernière connexion", at: c.lastLoginAt.toISOString() });
  if (c.lastPasswordChangeAt)
    events.push({ label: "Changement de mot de passe", at: c.lastPasswordChangeAt.toISOString() });
  if (c.emailVerifiedAt)
    events.push({ label: "E-mail vérifié", at: c.emailVerifiedAt.toISOString() });
  if (c.statusUpdatedAt)
    events.push({ label: "Statut modifié", at: c.statusUpdatedAt.toISOString() });
  if (c.sessionsValidAfter)
    events.push({ label: "Sessions révoquées", at: c.sessionsValidAfter.toISOString() });
  events.sort((a, b) => b.at.localeCompare(a.at));

  return {
    emailVerified: c.emailVerified,
    emailVerifiedAt: c.emailVerifiedAt?.toISOString() ?? null,
    providers,
    googleLinked: Boolean(c.googleId),
    discordLinked: Boolean(c.discordId),
    hasPassword: Boolean(c.passwordHash),
    lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
    lastPasswordChangeAt: c.lastPasswordChangeAt?.toISOString() ?? null,
    sessionsValidAfter: c.sessionsValidAfter?.toISOString() ?? null,
    status: normalizeStatus(c.status),
    marketingConsent: c.marketingConsent,
    recentEvents: events.slice(0, 10),
  };
}

// ── Mutations (all audited by the caller/action) ─────────────────────────────

type Actor = { id: string; name: string };
type Result = { ok: boolean; error?: string };

export async function setCustomerStatus(input: {
  customerId: string;
  status: string;
  reason: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  if (!(CUSTOMER_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: "Statut invalide." };
  }
  const target = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, status: true, role: true },
  });
  if (!target) return { ok: false, error: "Client introuvable." };
  // Never disable another admin through this flow.
  if (target.role === "ADMIN" && input.status !== "active") {
    return { ok: false, error: "Impossible de restreindre un compte administrateur." };
  }

  const disabling = input.status === "disabled";
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        status: input.status,
        statusReason: reason,
        statusUpdatedAt: new Date(),
        // Disabling forces logout of any existing session immediately.
        ...(disabling ? { sessionsValidAfter: new Date() } : {}),
      },
    });
    const action =
      input.status === "disabled"
        ? "customer.disabled"
        : target.status === "disabled" && input.status === "active"
          ? "customer.enabled"
          : "customer.status_changed";
    await writeAuditLog(
      {
        adminId: input.actor.id,
        adminName: input.actor.name,
        customerId: input.customerId,
        action,
        reason,
        metadata: { from: target.status, to: input.status },
      },
      tx,
    );
  });
  return { ok: true };
}

// GDPR-style account deletion. Personal data is scrubbed and credentials are
// destroyed (the account can no longer authenticate — see getCurrentCustomer,
// which rejects a customer with no password/Google/Discord credential), but
// orders, payments, and the Ghost Credit ledger are preserved for accounting.
// The freed email lets the person re-register from scratch.
export async function anonymizeCustomer(input: {
  customerId: string;
  reason: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  const target = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, status: true, role: true },
  });
  if (!target) return { ok: false, error: "Client introuvable." };
  if (target.role === "ADMIN") {
    return { ok: false, error: "Impossible de supprimer un compte administrateur." };
  }
  if (target.status === "deleted") {
    return { ok: false, error: "Ce compte est déjà supprimé." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Drop any outstanding auth tokens so a stale reset/verification link can't
    // resurrect a credential on the scrubbed account.
    await tx.authToken.deleteMany({ where: { customerId: input.customerId } });
    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        name: "Client supprimé",
        firstName: null,
        lastName: null,
        // Unique-but-inert placeholder; frees the real address for re-signup.
        email: `deleted-${input.customerId}@deleted.ghost.ma`,
        phone: null,
        image: null,
        birthday: null,
        // Destroy every login credential.
        passwordHash: null,
        googleId: null,
        discordId: null,
        authProvider: null,
        emailVerified: false,
        emailVerifiedAt: null,
        marketingConsent: false,
        // Scrub Discord identity + DM linkage.
        discordUsername: null,
        discordGlobalName: null,
        discordAvatar: null,
        discordDmUserId: null,
        discordDmUsername: null,
        discordDmDisplayName: null,
        discordDmAvatar: null,
        discordDmActivated: false,
        discordDmActivatedAt: null,
        status: "deleted",
        statusReason: reason,
        statusUpdatedAt: now,
        // Force-logout any live session.
        sessionsValidAfter: now,
      },
    });
    await writeAuditLog(
      {
        adminId: input.actor.id,
        adminName: input.actor.name,
        customerId: input.customerId,
        action: "customer.anonymized",
        reason,
        metadata: { from: target.status },
      },
      tx,
    );
  });
  return { ok: true };
}

export async function revokeCustomerSessions(input: {
  customerId: string;
  reason: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  const target = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "Client introuvable." };
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: input.customerId },
      data: { sessionsValidAfter: new Date() },
    });
    await writeAuditLog(
      {
        adminId: input.actor.id,
        adminName: input.actor.name,
        customerId: input.customerId,
        action: "customer.sessions_revoked",
        reason,
      },
      tx,
    );
  });
  return { ok: true };
}

export async function updateCustomerProfile(input: {
  customerId: string;
  actor: Actor;
  name?: string;
  phone?: string | null;
  preferredLanguage?: string | null;
  marketingConsent?: boolean;
}): Promise<Result> {
  await ensureDatabaseReady();
  const target = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, phone: true, preferredLanguage: true, marketingConsent: true },
  });
  if (!target) return { ok: false, error: "Client introuvable." };

  const data: Prisma.CustomerUpdateInput = {};
  const changed: Record<string, unknown> = {};
  if (input.name != null && input.name.trim() && input.name.trim() !== target.name) {
    data.name = input.name.trim().slice(0, 120);
    changed.name = true;
  }
  if (input.phone !== undefined) {
    const phone = input.phone?.trim() || null;
    if (phone !== target.phone) {
      data.phone = phone;
      changed.phone = true;
    }
  }
  if (input.preferredLanguage !== undefined) {
    const lang = input.preferredLanguage?.trim() || null;
    if (lang !== target.preferredLanguage) {
      data.preferredLanguage = lang;
      changed.preferredLanguage = lang;
    }
  }
  if (input.marketingConsent !== undefined && input.marketingConsent !== target.marketingConsent) {
    data.marketingConsent = input.marketingConsent;
    changed.marketingConsent = input.marketingConsent;
  }
  if (Object.keys(changed).length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: input.customerId }, data });
    const consentOnly =
      Object.keys(changed).length === 1 && "marketingConsent" in changed;
    await writeAuditLog(
      {
        adminId: input.actor.id,
        adminName: input.actor.name,
        customerId: input.customerId,
        action: consentOnly ? "customer.consent_changed" : "customer.profile_edited",
        metadata: { fields: Object.keys(changed) },
      },
      tx,
    );
  });
  return { ok: true };
}

/**
 * Secure admin-initiated email change. Does NOT silently overwrite identity: the
 * new address is set, verification is reset + re-sent to the new address, and
 * existing sessions are revoked so the customer re-authenticates. Order history
 * linkage (customerId + completed-order email snapshots) is preserved. Audited.
 */
export async function startCustomerEmailChange(input: {
  customerId: string;
  newEmail: string;
  reason: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Un motif est obligatoire." };
  const newEmail = input.newEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  const target = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, email: true },
  });
  if (!target) return { ok: false, error: "Client introuvable." };
  if (newEmail === target.email.toLowerCase()) {
    return { ok: false, error: "Adresse identique à l'actuelle." };
  }
  const clash = await prisma.customer.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "Cette adresse est déjà utilisée." };

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        email: newEmail,
        emailVerified: false,
        emailVerifiedAt: null,
        // Force re-authentication after an identity change.
        sessionsValidAfter: new Date(),
      },
    });
    await writeAuditLog(
      {
        adminId: input.actor.id,
        adminName: input.actor.name,
        customerId: input.customerId,
        action: "customer.email_change_started",
        reason,
        metadata: { fromDomain: target.email.split("@")[1], toDomain: newEmail.split("@")[1] },
      },
      tx,
    );
  });
  // Send verification to the NEW address so the change is verified by the owner.
  await sendVerificationEmail({ id: target.id, name: target.name, email: newEmail }).catch(
    () => undefined,
  );
  return { ok: true };
}

export async function adminResendVerification(input: {
  customerId: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const c = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  if (!c) return { ok: false, error: "Client introuvable." };
  if (c.emailVerified) return { ok: false, error: "E-mail déjà vérifié." };
  await sendVerificationEmail({ id: c.id, name: c.name, email: c.email });
  await writeAuditLog({
    adminId: input.actor.id,
    adminName: input.actor.name,
    customerId: input.customerId,
    action: "customer.verification_resent",
  });
  return { ok: true };
}

export async function adminSendPasswordReset(input: {
  customerId: string;
  actor: Actor;
}): Promise<Result> {
  await ensureDatabaseReady();
  const c = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, email: true, passwordHash: true },
  });
  if (!c) return { ok: false, error: "Client introuvable." };
  await sendPasswordResetEmail({ id: c.id, name: c.name, email: c.email });
  await writeAuditLog({
    adminId: input.actor.id,
    adminName: input.actor.name,
    customerId: input.customerId,
    action: "customer.password_reset_sent",
  });
  return { ok: true };
}
