"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusShort, orderStatusBadgeClass } from "@/lib/orderStatus";
import {
  getAdminOrdersAction,
  getAdminStatsAction,
  getInventorySummaryAction,
} from "@/app/actions/admin";
import type { AdminOrderDTO, AdminStatsDTO, InventorySummaryDTO } from "@/lib/dto";
import SettingsPanel from "@/components/admin/SettingsPanel";
import FulfillmentPanel from "@/components/admin/FulfillmentPanel";
import InventoryPanel from "@/components/admin/InventoryPanel";
import PaymentSettingsPanel from "@/components/admin/PaymentSettingsPanel";
import PaymentsPanel from "@/components/admin/PaymentsPanel";
import ProductsPanel from "@/components/admin/ProductsPanel";
import CustomersPanel from "@/components/admin/CustomersPanel";

const navItems = [
  { id: "overview", label: "Overview", icon: "[]" },
  {
    id: "homepage-editor",
    label: "Homepage editor",
    icon: "HE",
    href: "/admin/editor",
  },
  { id: "settings", label: "Store settings", icon: "SS" },
  { id: "products", label: "Products", icon: "PR" },
  { id: "inventory", label: "Inventory", icon: "IN" },
  { id: "payments", label: "Payments", icon: "PM" },
  { id: "payment-settings", label: "Payment settings", icon: "PS" },
  { id: "fulfillment", label: "Manual fulfillment", icon: "MF" },
  { id: "customers", label: "Customers", icon: "CU" },
  { id: "suppliers", label: "Supplier API", icon: "API" },
  { id: "refunds", label: "Refunds", icon: "RF" },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [orderQuery, setOrderQuery] = useState("");

  // Overview state — loaded lazily when overview tab is active
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrderDTO[]>([]);
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryDTO[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [orders, summary, statsData] = await Promise.all([
        getAdminOrdersAction(),
        getInventorySummaryAction(),
        getAdminStatsAction(),
      ]);
      setRecentOrders(orders);
      setInventorySummary(summary);
      setStats(statsData);
    } catch (e) {
      setOverviewError(String(e));
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // Reload overview every time the user navigates to it
  useEffect(() => {
    if (activeTab === "overview") loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filteredOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    if (!query) return recentOrders;
    return recentOrders.filter((order) => {
      const itemText = order.items
        .map((item) => `${item.productId} ${item.name} ${item.quantity}`)
        .join(" ");
      return [
        order.id,
        order.customerEmail,
        order.customerName,
        order.status,
        order.paymentMethod,
        itemText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [recentOrders, orderQuery]);

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Database-backed inventory and manual fulfillment.
          </p>
        </div>
        <span className="chip border-accent/40 text-accent">Production data</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit">
          <nav className="card space-y-1 p-3 text-sm">
            {navItems.map((item) => {
              const className = `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${
                activeTab === item.id
                  ? "bg-accent/10 font-medium text-white"
                  : "text-muted hover:bg-surface hover:text-white"
              }`;

              if ("href" in item && item.href) {
                return (
                  <Link key={item.id} href={item.href} className={className}>
                    <NavIcon value={item.icon} />
                    {item.label}
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={className}
                >
                  <NavIcon value={item.icon} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {activeTab === "settings" ? (
          <SettingsPanel />
        ) : activeTab === "products" ? (
          <ProductsPanel />
        ) : activeTab === "inventory" ? (
          <InventoryPanel />
        ) : activeTab === "payments" ? (
          <PaymentsPanel />
        ) : activeTab === "payment-settings" ? (
          <PaymentSettingsPanel />
        ) : activeTab === "fulfillment" ? (
          <FulfillmentPanel />
        ) : activeTab === "customers" ? (
          <CustomersPanel />
        ) : activeTab === "suppliers" ? (
          <RestoredPanel
            title="Supplier API"
            eyebrow="Admin section restored"
            text="Supplier API controls are available from the admin navigation. Existing supplier automation remains untouched."
          />
        ) : activeTab === "refunds" ? (
          <RestoredPanel
            title="Refunds"
            eyebrow="Admin section restored"
            text="Refund review is back in the admin navigation. Payment and order records continue to come from Supabase."
          />
        ) : (
          <div className="space-y-8">
            {overviewError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                <p className="font-semibold text-red-50">Admin data failed to load</p>
                <p className="mt-1">{overviewError}</p>
                <button
                  type="button"
                  onClick={loadOverview}
                  className="mt-2 text-xs font-medium text-red-300 hover:text-white"
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Total orders"
                value={overviewLoading ? "…" : stats ? String(stats.totalOrders) : "-"}
              />
              <Stat
                label="Pending fulfillment"
                value={overviewLoading ? "…" : stats ? String(stats.pendingCount) : "-"}
              />
              <Stat
                label="Total revenue"
                value={overviewLoading ? "…" : stats ? formatMAD(stats.totalRevenue) : "-"}
              />
              <Stat
                label="Customers"
                value={overviewLoading ? "…" : stats ? String(stats.customerCount) : "-"}
              />
            </div>

            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-bold text-white">Recent orders</h2>
                  <p className="mt-1 text-xs text-muted">
                    Search by order ID, email, customer name, status, payment method, or item.
                  </p>
                </div>
                <div className="w-full sm:w-80">
                  <label className="sr-only" htmlFor="admin-order-search">
                    Search orders
                  </label>
                  <input
                    id="admin-order-search"
                    className="input h-10 py-0 text-sm"
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                    placeholder="Find an order..."
                  />
                </div>
              </div>
              {overviewLoading ? (
                <p className="px-5 py-8 text-sm text-muted">Loading...</p>
              ) : recentOrders.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">
                  No orders yet. Place a test order to see it here.
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">
                  No orders match your search.
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
                      {filteredOrders.slice(0, 10).map((order) => (
                        <tr key={order.id} className="border-b border-border/60">
                          <td className="px-5 py-3 font-mono text-xs text-white">
                            {order.id}
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-white">{order.customerName}</p>
                            <p className="text-xs text-muted">
                              {order.customerEmail}
                            </p>
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
                            <button
                              type="button"
                              onClick={() => setActiveTab("fulfillment")}
                              className="text-xs font-medium text-accent hover:text-accent-hover"
                            >
                              {order.status === "delivered" ? "View" : "Fulfill"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-bold text-white">Inventory summary</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("inventory")}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Manage codes
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 font-medium">Product</th>
                      <th className="px-5 py-3 font-medium">Unused</th>
                      <th className="px-5 py-3 font-medium">Used</th>
                      <th className="px-5 py-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewLoading ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-sm text-muted">
                          Loading...
                        </td>
                      </tr>
                    ) : inventorySummary.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-sm text-muted">
                          No inventory codes yet. Use Manage codes to add stock.
                        </td>
                      </tr>
                    ) : (
                      inventorySummary.map((row) => (
                        <tr key={row.productId} className="border-b border-border/60">
                          <td className="px-5 py-3 font-mono text-xs text-white">
                            {row.productId}
                          </td>
                          <td className="px-5 py-3">
                            <span className="font-semibold text-green-400">
                              {row.unused}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-muted">{row.used}</td>
                          <td className="px-5 py-3 text-muted">{row.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function NavIcon({ value }: { value: string }) {
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded border border-border bg-base px-1 text-[10px] font-bold text-muted">
      {value}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-white">{value}</p>
    </div>
  );
}

function RestoredPanel({
  title,
  eyebrow,
  text,
}: {
  title: string;
  eyebrow: string;
  text: string;
}) {
  return (
    <section className="card p-6">
      <p className="text-xs uppercase tracking-wide text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{text}</p>
    </section>
  );
}
