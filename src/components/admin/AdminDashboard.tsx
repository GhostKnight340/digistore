"use client";

import Link from "next/link";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import {
  getAdminOverviewAction,
  getInventoryProductsAction,
} from "@/app/actions/admin";
import type { AdminOrderSummaryDTO, AdminStatsDTO, InventoryProductDTO } from "@/lib/dto";

const SettingsPanel = lazy(() => import("@/components/admin/SettingsPanel"));
const ProductsPanel = lazy(() => import("@/components/admin/ProductsPanel"));
const InventoryPanel = lazy(() => import("@/components/admin/InventoryPanel"));
const PaymentsPanel = lazy(() => import("@/components/admin/PaymentsPanel"));
const PaymentSettingsPanel = lazy(() => import("@/components/admin/PaymentSettingsPanel"));
const FulfillmentPanel = lazy(() => import("@/components/admin/FulfillmentPanel"));
const CustomersPanel = lazy(() => import("@/components/admin/CustomersPanel"));

const navItems = [
  { id: "overview", label: "Overview", icon: "[]" },
  { id: "homepage-editor", label: "Homepage editor", icon: "HE", href: "/admin/editor" },
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

const LOW_STOCK_MAX = 5;

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [orderQuery, setOrderQuery] = useState("");
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [recentOrders, setRecentOrders] = useState<AdminOrderSummaryDTO[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProductDTO[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const [overview, summary] = await Promise.all([
        getAdminOverviewAction(),
        getInventoryProductsAction(),
      ]);
      setRecentOrders(overview.recentOrders);
      setInventoryProducts(summary);
      setStats({
        totalOrders: overview.totalOrders,
        pendingCount: overview.pendingFulfillment,
        totalRevenue: overview.totalRevenue,
        customerCount: overview.customers,
      });
    } catch (error) {
      console.error("Failed to load admin overview", error);
      setOverviewError("Admin overview could not be loaded.");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "overview") loadOverview();
  }, [activeTab, loadOverview]);

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

  const inventoryAlerts = useMemo(
    () =>
      inventoryProducts
        .flatMap((product) =>
          product.variants
            .filter((variant) => variant.unused <= LOW_STOCK_MAX)
            .map((variant) => ({
              productName: product.productName,
              variantName: variant.name,
              unused: variant.unused,
            })),
        )
        .sort((a, b) => a.unused - b.unused)
        .slice(0, 5),
    [inventoryProducts],
  );

  const panelFallback = (
    <section className="card p-6 text-sm text-muted">Loading section...</section>
  );

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Store inventory, payments, and manual fulfillment.
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
          <Suspense fallback={panelFallback}>
            <SettingsPanel />
          </Suspense>
        ) : activeTab === "products" ? (
          <Suspense fallback={panelFallback}>
            <ProductsPanel />
          </Suspense>
        ) : activeTab === "inventory" ? (
          <Suspense fallback={panelFallback}>
            <InventoryPanel />
          </Suspense>
        ) : activeTab === "payments" ? (
          <Suspense fallback={panelFallback}>
            <PaymentsPanel />
          </Suspense>
        ) : activeTab === "payment-settings" ? (
          <Suspense fallback={panelFallback}>
            <PaymentSettingsPanel />
          </Suspense>
        ) : activeTab === "fulfillment" ? (
          <Suspense fallback={panelFallback}>
            <FulfillmentPanel />
          </Suspense>
        ) : activeTab === "customers" ? (
          <Suspense fallback={panelFallback}>
            <CustomersPanel />
          </Suspense>
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
                value={overviewLoading ? "..." : stats ? String(stats.totalOrders) : "-"}
              />
              <Stat
                label="Pending fulfillment"
                value={overviewLoading ? "..." : stats ? String(stats.pendingCount) : "-"}
              />
              <Stat
                label="Total revenue"
                value={overviewLoading ? "..." : stats ? formatMAD(stats.totalRevenue) : "-"}
              />
              <Stat
                label="Customers"
                value={overviewLoading ? "..." : stats ? String(stats.customerCount) : "-"}
              />
            </div>

            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-bold text-white">Recent orders</h2>
                  <p className="mt-1 text-xs text-muted">
                    Latest bounded orders. Open Payments or Fulfillment for work queues.
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
                      {filteredOrders.map((order) => (
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
                            <span className={`chip ${orderStatusBadgeClass(order.status)}`}>
                              {orderStatusShort(order.status)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <Link
                              href={`/admin/orders/${order.id}`}
                              className="text-xs font-medium text-accent hover:text-accent-hover"
                            >
                              {order.status === "delivered" ? "View" : "Fulfill"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-white">Inventory alerts</h2>
                  <p className="mt-1 text-xs text-muted">
                    Low and out-of-stock variants from the current inventory counts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("inventory")}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Manage codes
                </button>
              </div>
              {overviewLoading ? (
                <p className="mt-4 text-sm text-muted">Loading...</p>
              ) : inventoryProducts.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  No inventory codes yet. Use Manage codes to add stock.
                </p>
              ) : inventoryAlerts.length === 0 ? (
                <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                  All tracked variants are in stock.
                </div>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {inventoryAlerts.map((alert) => {
                    const out = alert.unused === 0;
                    return (
                      <button
                        key={`${alert.productName}-${alert.variantName}`}
                        type="button"
                        onClick={() => setActiveTab("inventory")}
                        className={`rounded-xl border px-4 py-3 text-left ${
                          out
                            ? "border-red-500/40 bg-red-500/10"
                            : "border-amber-500/40 bg-amber-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              out ? "bg-red-400" : "bg-amber-400"
                            }`}
                          />
                          <span className="text-sm font-medium text-white">
                            {alert.productName} {alert.variantName}
                          </span>
                        </div>
                        <p className={`mt-1 text-xs ${out ? "text-red-300" : "text-amber-300"}`}>
                          {out
                            ? "Out of stock"
                            : `Only ${alert.unused} code${alert.unused === 1 ? "" : "s"} left`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
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
