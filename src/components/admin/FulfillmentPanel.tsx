"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import {
  orderStatusShort,
  orderStatusBadgeClass,
  isDelivered,
} from "@/lib/orderStatus";
import { getAdminFulfillmentOrdersAction } from "@/app/actions/admin";
import type { AdminOrderSummaryDTO } from "@/lib/dto";

type Filter = "todo" | "all";

const LOAD_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error(`${label} took too long to respond.`)),
        LOAD_TIMEOUT_MS,
      );
    }),
  ]);
}

export default function FulfillmentPanel() {
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");

  const load = useCallback(async () => {
    setLoadError("");
    setLoaded(false);
    try {
      const data = await withTimeout(getAdminFulfillmentOrdersAction(), "Orders");
      setOrders(data);
    } catch (error) {
      console.error("Failed to load fulfillment orders", error);
      setLoadError("Orders could not be refreshed. Showing the latest loaded data.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleOrders = useMemo(
    () =>
      filter === "all"
        ? orders
        : orders.filter((order) => order.status !== "delivered"),
    [orders, filter],
  );
  const todoCount = orders.filter((order) => order.status !== "delivered").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Manual fulfillment</h2>
          <p className="mt-1 text-sm text-muted">
            Review payments, open order details, assign codes, and deliver orders.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
          <button
            type="button"
            onClick={() => setFilter("todo")}
            className={`rounded-md px-3 py-1.5 ${
              filter === "todo" ? "bg-accent/15 text-white" : "text-muted"
            }`}
          >
            To process ({todoCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 ${
              filter === "all" ? "bg-accent/15 text-white" : "text-muted"
            }`}
          >
            All ({orders.length})
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {loadError}
        </div>
      ) : null}

      <section className="card overflow-hidden">
        {!loaded ? (
          <p className="px-5 py-8 text-sm text-muted">Loading...</p>
        ) : visibleOrders.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            {filter === "todo"
              ? "No pending orders. Everything is delivered."
              : "No orders yet. Place a test order to see it here."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Order</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60">
                    <td className="px-5 py-3 font-mono text-xs text-white">
                      {order.id}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-white">{order.customerName}</p>
                      <p className="text-xs text-muted">{order.customerEmail}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-white">
                      {formatMAD(order.totalMad)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`chip ${orderStatusBadgeClass(order.status)}`}
                      >
                        {orderStatusShort(order.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-xs font-medium text-accent hover:text-accent-hover"
                      >
                        {isDelivered(order.status) ? "View" : "Fulfill"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
