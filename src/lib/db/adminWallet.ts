import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { getLockedCreditForCustomer } from "./ghostCredit";
import { reconcileWallet } from "./walletReconcile";
import { computeQualifyingSpend, getMilestoneProgressForCustomer } from "./milestones";
import { formatPublicOrderNumber } from "@/lib/orderNumber";
import type {
  AdminWalletDetailDTO,
  AdminWalletLedgerPageDTO,
  AdminWalletLedgerRowDTO,
  WalletLedgerFilter,
} from "@/lib/dto";

const LEDGER_PAGE_SIZE = 25;

/** Full wallet summary for the admin customer-wallet page. */
export async function getAdminWalletDetail(customerId: string): Promise<AdminWalletDetailDTO | null> {
  await ensureDatabaseReady();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      email: true,
      ghostCreditBalanceMad: true,
      ghostCreditExpiresAt: true,
      lastQualifyingCreditEarnedAt: true,
      expirationReminderEnabled: true,
      walletFrozen: true,
      walletFrozenReason: true,
    },
  });
  if (!customer) return null;

  const [locked, reconcile, qualifyingSpend, milestones] = await Promise.all([
    getLockedCreditForCustomer(customerId),
    reconcileWallet(customerId),
    computeQualifyingSpend(prisma, customerId),
    getMilestoneProgressForCustomer(customerId),
  ]);

  // Sequence numbers for the locked orders (same scheme as the storefront).
  const lockedOrders = await Promise.all(
    locked.orders.map(async (o) => {
      const earlier = await prisma.order.count({
        where: {
          OR: [
            { createdAt: { lt: new Date(o.createdAt) } },
            { createdAt: new Date(o.createdAt), id: { lt: o.orderId } },
          ],
        },
      });
      return {
        orderId: o.orderId,
        publicOrderNumber: formatPublicOrderNumber(earlier + 1),
        amountMad: o.amountMad,
        status: o.status,
        createdAt: o.createdAt,
      };
    }),
  );

  const expiresAt = customer.ghostCreditExpiresAt;
  return {
    customerId: customer.id,
    name: customer.name,
    email: customer.email,
    balanceMad: customer.ghostCreditBalanceMad,
    lockedMad: locked.lockedMad,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysUntilExpiry:
      expiresAt && customer.ghostCreditBalanceMad > 0
        ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null,
    lastQualifyingAt: customer.lastQualifyingCreditEarnedAt?.toISOString() ?? null,
    reminderEnabled: customer.expirationReminderEnabled,
    frozen: customer.walletFrozen,
    frozenReason: customer.walletFrozenReason,
    qualifyingSpendMad: qualifyingSpend,
    nextMilestone: milestones.next,
    reconcile: {
      derivedMad: reconcile?.derivedMad ?? 0,
      cachedMad: reconcile?.cachedMad ?? customer.ghostCreditBalanceMad,
      diffMad: reconcile?.diffMad ?? 0,
      ok: reconcile?.ok ?? true,
    },
    lockedOrders,
  };
}

function buildLedgerRow(row: {
  id: string;
  createdAt: Date;
  reason: string;
  direction: string;
  amountMad: number;
  status: string;
  resetsExpiration: boolean;
  orderId: string | null;
  milestoneId: string | null;
  thresholdMad: number | null;
  idempotencyKey: string;
  source: string;
  note: string | null;
  promoCode: { code: string } | null;
}): AdminWalletLedgerRowDTO {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
    direction: row.direction as "credit" | "debit",
    amountMad: row.amountMad,
    status: row.status,
    resetsExpiration: row.resetsExpiration,
    orderId: row.orderId,
    milestoneId: row.milestoneId,
    thresholdMad: row.thresholdMad,
    promoCode: row.promoCode?.code ?? null,
    source: row.source,
    note: row.note,
    idempotencyKey: row.idempotencyKey,
  };
}

/** Paginated + filterable ledger for the admin wallet page. */
export async function getAdminWalletLedger(
  customerId: string,
  filter: WalletLedgerFilter,
  page: number,
): Promise<AdminWalletLedgerPageDTO> {
  await ensureDatabaseReady();
  const where: Prisma.GhostCreditTransactionWhereInput = { customerId };
  if (filter.direction === "credit" || filter.direction === "debit") where.direction = filter.direction;
  if (filter.reason) where.reason = filter.reason;
  if (filter.status) where.status = filter.status;
  if (filter.orderId) where.orderId = filter.orderId;
  if (filter.milestoneId) where.milestoneId = filter.milestoneId;
  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from ? { gte: new Date(filter.from) } : {}),
      ...(filter.to ? { lte: new Date(filter.to) } : {}),
    };
  }

  const safePage = Math.max(1, Math.floor(page || 1));
  const [total, rows] = await Promise.all([
    prisma.ghostCreditTransaction.count({ where }),
    prisma.ghostCreditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * LEDGER_PAGE_SIZE,
      take: LEDGER_PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        reason: true,
        direction: true,
        amountMad: true,
        status: true,
        resetsExpiration: true,
        orderId: true,
        milestoneId: true,
        thresholdMad: true,
        idempotencyKey: true,
        source: true,
        note: true,
        promoCode: { select: { code: true } },
      },
    }),
  ]);

  return {
    rows: rows.map(buildLedgerRow),
    total,
    page: safePage,
    pageSize: LEDGER_PAGE_SIZE,
  };
}
