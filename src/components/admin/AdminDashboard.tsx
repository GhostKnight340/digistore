"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusShort, orderStatusBadgeClass } from "@/lib/orderStatus";
import {
  getAdminOrdersAction,
  getInventoryAction,
} from "@/app/actions/admin";
import type { AdminOrderDTO, InventoryGroupDTO } from "@/lib/dto";
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

type AdminDashboardProps = {
  initialOrders: AdminOrderDTO[];
  initialInventory: InventoryGroupDTO[];
  initialLoadError?: string | null;
};

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

export default function AdminDashboard({
  initialOrders,
  initialInventory,
  initialLoadError = null,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [orders, setOrders] = useState<AdminOrderDTO[]>(initialOrders);
  const [inventory, setInventory] =
    useState<InventoryGroupDTO[]>(initialInventory);
  const [loaded, setLoaded] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);
  const [orderQuery, setOrderQuery] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);

    const [ordersResult, inventoryResult] = await Promise.allSettled([
      withTimeout(getAdminOrdersAction(), "Orders"),
      withTimeout(getInventoryAction(), "Inventory"),
    ]);

    if (ordersResult.status === "fulfilled") {
      setOrders(ordersResult.value);
    } else {
      console.error("Failed to load admin orders", ordersResult.reason);
    }

    if (inventoryResult.status === "fulfilled") {
      setInventory(inventoryResult.value);
    } else {
      console.error("Failed to load inventory", inventoryResult.reason);
    }

    const failures = [ordersResult, inventoryResult].filter(
      (result) => result.status === "rejected",
    ).length;

    if (failures > 0) {
      setLoadError(
        failures === 2
          ? "Orders and inventory could not be refreshed. Showing the latest loaded data."
          : ordersResult.status === "rejected"
            ? "Orders could not be refreshed. Inventory is still available below."
            : "Inventory could not be refreshed. Recent orders are still available below.",
      );
    }

    setLoaded(true);
  }, []);

  // Initial data is rendered by the server, then refreshed only after returning
  // from another tab so the admin page never gets stuck on a client loading state.
  const [hasLeftOverview, setHasLeftOverview] = useState(false);

  useEffect(() => {
    if (activeTab !== "overview") {
      setHasLeftOverview(true);
      return;
    }
    if (hasLeftOverview) load();
  }, [activeTab, hasLeftOverview, load]);

  const totalRevenue = orders.reduce((sum, order) => sum + order.totalMad, 0);
  const customers = new Set(orders.map((o) => o.customerEmail)).size;
  const pendingCount = orders.filter((o) => o.status !== "delivered").length;

  const filteredOrders = useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    if (!query) return orders;

    return orders.filter((order) => {
      const itemText = order.items
        .map((item) => `${item.productId} ${item.name} ${item.quantity}`)
        .join(" ");
      const searchable = [
        order.id,
        order.customerEmail,
        order.customerName,
        order.status,
        order.paymentMethod,
        itemText,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [orders, orderQuery]);

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
          <InventoryPanel initialGroups={inventory} />
        ) : activeTab === "payments" ? (
          <PaymentsPanel />
        ) : activeTab === "payment-settings" ? (
          <PaymentSettingsPanel />
        ) : activeTab === "fulfillment" ? (
          <FulfillmentPanel initialOrders={orders} />
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
            {loadError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                <p className="font-semibold text-red-50">
                  Admin data refresh failed
                </p>
                <p className="mt-1">{loadError}</p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Total orders"
                value={loaded ? String(orders.length) : "-"}
              />
              <Stat
                label="Pending fulfillment"
                value={loaded ? String(pendingCount) : "-"}
              />
              <Stat
                label="Total revenue"
                value={loaded ? formatMAD(totalRevenue) : "-"}
              />
              <Stat
                label="Customers"
                value={loaded ? String(customers) : "-"}
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
              {!loaded ? (
                <p className="px-5 py-8 text-sm text-muted">Loading...</p>
              ) : orders.length === 0 ? (
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
                              className={`chip ${orderStatusBadgeClass(
                                order.status,
                              )}`}
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
                    {!loaded ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-sm text-muted"
                        >
                          Loading...
                        </td>
                      </tr>
                    ) : inventory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-sm text-muted"
                        >
                          No inventory codes yet. Use Manage codes to add stock.
                        </td>
                      </tr>
                    ) : (
                      inventory.map((row) => (
                        <tr
                          key={row.productId}
                          className="border-b border-border/60"
                        >
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
