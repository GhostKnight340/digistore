"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { getAdminOrdersAction } from "@/app/actions/admin";
import type { CustomerDTO } from "@/lib/dto";

function deriveCustomers(orders: Awaited<ReturnType<typeof getAdminOrdersAction>>): CustomerDTO[] {
  const map = new Map<string, CustomerDTO>();
  for (const o of orders) {
    const existing = map.get(o.customerEmail);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += o.totalMad;
      if (o.createdAt > existing.lastOrderAt) existing.lastOrderAt = o.createdAt;
    } else {
      map.set(o.customerEmail, {
        email: o.customerEmail,
        name: o.customerName,
        orderCount: 1,
        totalSpent: o.totalMad,
        lastOrderAt: o.createdAt,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.lastOrderAt.localeCompare(a.lastOrderAt),
  );
}

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const orders = await getAdminOrdersAction();
    setCustomers(deriveCustomers(orders));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold text-white">Customers</h2>
          <p className="mt-0.5 text-xs text-muted">Unique buyers derived from order history</p>
        </div>
        <button type="button" onClick={load} className="btn-ghost py-1 text-xs">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          No customers yet. Orders will appear here once placed.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Orders</th>
                <th className="px-5 py-3 font-medium">Total spent</th>
                <th className="px-5 py-3 font-medium">Last order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.email} className="border-b border-border/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{c.name}</p>
                    <p className="text-xs text-muted">{c.email}</p>
                  </td>
                  <td className="px-5 py-3 text-muted">{c.orderCount}</td>
                  <td className="px-5 py-3 font-semibold text-white">{formatMAD(c.totalSpent)}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(c.lastOrderAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
