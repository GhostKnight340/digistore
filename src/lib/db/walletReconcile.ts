import "server-only";

import { prisma, ensureDatabaseReady } from "./prisma";

/**
 * Ghost Credit reconciliation — the ledger is the source of truth; the cached
 * Customer.ghostCreditBalanceMad is a performance cache. This recomputes the
 * balance from the append-only ledger and compares it to the cache, so cache
 * drift (which should never happen given transactional updates) is detectable
 * and repairable WITHOUT rewriting any historical ledger row.
 *
 * "Derived balance" = Σ(active credits) − Σ(active debits). Reversed/expired
 * rows and their offsetting debits are excluded by the `active` filter, so they
 * never double-count.
 */

export interface WalletReconcileRow {
  customerId: string;
  email: string;
  derivedMad: number;
  cachedMad: number;
  diffMad: number;
  ok: boolean;
  frozen: boolean;
  lifetimeEarnedMad: number;
  lifetimeSpentMad: number;
}

async function reconcileRows(customerIds?: string[]): Promise<WalletReconcileRow[]> {
  await ensureDatabaseReady();
  // Aggregate the ledger per customer/direction in one grouped query.
  const grouped = await prisma.ghostCreditTransaction.groupBy({
    by: ["customerId", "direction", "status"],
    where: customerIds ? { customerId: { in: customerIds } } : undefined,
    _sum: { amountMad: true },
  });

  type Acc = { activeCredit: number; activeDebit: number; lifetimeCredit: number; lifetimeSpent: number };
  const byCustomer = new Map<string, Acc>();
  for (const g of grouped) {
    const acc = byCustomer.get(g.customerId) ?? { activeCredit: 0, activeDebit: 0, lifetimeCredit: 0, lifetimeSpent: 0 };
    const sum = g._sum.amountMad ?? 0;
    if (g.direction === "credit") {
      acc.lifetimeCredit += sum;
      if (g.status === "active") acc.activeCredit += sum;
    } else {
      if (g.status === "active") acc.activeDebit += sum;
      // "Spent" = order redemptions specifically is tracked separately below; here
      // lifetimeSpent counts all active debits as an approximation of outflow.
      if (g.status === "active") acc.lifetimeSpent += sum;
    }
    byCustomer.set(g.customerId, acc);
  }

  const ids = [...byCustomer.keys()];
  if (ids.length === 0) return [];
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, ghostCreditBalanceMad: true, walletFrozen: true },
  });
  const custById = new Map(customers.map((c) => [c.id, c]));

  return ids.map((id) => {
    const acc = byCustomer.get(id)!;
    const c = custById.get(id);
    const derivedMad = acc.activeCredit - acc.activeDebit;
    const cachedMad = c?.ghostCreditBalanceMad ?? 0;
    return {
      customerId: id,
      email: c?.email ?? "(deleted)",
      derivedMad,
      cachedMad,
      diffMad: cachedMad - derivedMad,
      ok: cachedMad === derivedMad,
      frozen: c?.walletFrozen ?? false,
      lifetimeEarnedMad: acc.lifetimeCredit,
      lifetimeSpentMad: acc.lifetimeSpent,
    };
  });
}

/** Reconcile a single customer's wallet. */
export async function reconcileWallet(customerId: string): Promise<WalletReconcileRow | null> {
  const rows = await reconcileRows([customerId]);
  return rows[0] ?? null;
}

/** Reconcile every wallet that has any ledger history. Read-only. */
export async function reconcileAllWallets(): Promise<{
  checked: number;
  mismatches: WalletReconcileRow[];
}> {
  const rows = await reconcileRows();
  const mismatches = rows.filter((r) => !r.ok);
  if (mismatches.length > 0) {
    console.error(
      "[ghost-credit] reconcile.mismatch",
      JSON.stringify(mismatches.map((m) => ({ customerId: m.customerId, cached: m.cachedMad, derived: m.derivedMad, diff: m.diffMad }))),
    );
  }
  return { checked: rows.length, mismatches };
}

/**
 * Repair a drifted cache by setting it to the ledger-derived balance. This does
 * NOT rewrite history — the ledger is untouched; only the performance cache is
 * corrected, inside a row-locked transaction. Returns before/after for audit.
 */
export async function repairWalletCache(customerId: string): Promise<{ before: number; after: number; changed: boolean }> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    const rows = await tx.ghostCreditTransaction.groupBy({
      by: ["direction"],
      where: { customerId, status: "active" },
      _sum: { amountMad: true },
    });
    let derived = 0;
    for (const r of rows) {
      const sum = r._sum.amountMad ?? 0;
      derived += r.direction === "credit" ? sum : -sum;
    }
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { ghostCreditBalanceMad: true },
    });
    const before = customer?.ghostCreditBalanceMad ?? 0;
    if (before !== derived) {
      await tx.customer.update({ where: { id: customerId }, data: { ghostCreditBalanceMad: derived } });
      console.warn(
        "[ghost-credit] reconcile.repair",
        JSON.stringify({ customerId, before, after: derived }),
      );
    }
    return { before, after: derived, changed: before !== derived };
  });
}
