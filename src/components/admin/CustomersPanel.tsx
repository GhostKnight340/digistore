"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { getAdminCustomersAction } from "@/app/actions/admin";
import type { CustomerDTO } from "@/lib/dto";

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCustomers(await getAdminCustomersAction());
    } catch (err) {
      console.error("Failed to load customers", err);
      setError("Customers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="font-bold text-white">Customers</h2>
          <p className="mt-0.5 text-xs text-muted">
            Latest 100 buyers from customer records.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost py-1 text-xs">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Loading...</p>
      ) : error ? (
        <p className="px-5 py-8 text-sm text-red-400">{error}</p>
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
              {customers.map((customer) => (
                <tr key={customer.email} className="border-b border-border/60">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{customer.name}</p>
                    <p className="text-xs text-muted">{customer.email}</p>
                  </td>
                  <td className="px-5 py-3 text-muted">{customer.orderCount}</td>
                  <td className="px-5 py-3 font-semibold text-white">
                    {formatMAD(customer.totalSpent)}
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {formatDate(customer.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
