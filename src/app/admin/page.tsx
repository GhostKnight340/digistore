"use client";

import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import { products } from "@/lib/products";
import { inventorySnapshot } from "@/lib/inventory";
import { formatMAD, formatDate } from "@/lib/format";
import SettingsPanel from "@/components/admin/SettingsPanel";

const navItems = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "products", label: "Products", icon: "🛍️" },
  { id: "inventory", label: "Inventory", icon: "🔑" },
  { id: "orders", label: "Orders", icon: "🧾" },
  { id: "customers", label: "Customers", icon: "👥" },
  { id: "fulfillment", label: "Manual fulfillment", icon: "📦" },
  { id: "suppliers", label: "Supplier API", icon: "🔌" },
  { id: "refunds", label: "Refunds", icon: "↩" },
];

export default function AdminPage() {
  const { orders, ready } = useStore();
  const [activeTab, setActiveTab] = useState("overview");

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const customers = new Set(orders.map((order) => order.email)).size;
  const inventory = inventorySnapshot();

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Phase 1 placeholder - structure only, limited functionality.
          </p>
        </div>
        <span className="chip border-accent/40 text-accent">Prototype mode</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit">
          <nav className="card space-y-1 p-3 text-sm">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${
                  activeTab === item.id
                    ? "bg-accent/10 font-medium text-white"
                    : "text-muted"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {activeTab === "settings" ? (
          <SettingsPanel />
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Total orders"
                value={ready ? String(orders.length) : "-"}
              />
              <Stat
                label="Total revenue"
                value={ready ? formatMAD(totalRevenue) : "-"}
              />
              <Stat label="Products" value={String(products.length)} />
              <Stat
                label="Customers"
                value={ready ? String(customers) : "-"}
              />
            </div>

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="font-bold text-white">Recent orders</h2>
                <span className="text-xs text-muted">Manual fulfillment</span>
              </div>
              {!ready ? (
                <p className="px-5 py-8 text-sm text-muted">Loading...</p>
              ) : orders.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">
                  No orders yet. Place a test order to see it here.
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
                      {orders.slice(0, 10).map((order) => (
                        <tr key={order.id} className="border-b border-border/60">
                          <td className="px-5 py-3 font-mono text-xs text-white">
                            {order.id}
                          </td>
                          <td className="px-5 py-3 text-muted">{order.email}</td>
                          <td className="px-5 py-3 text-muted">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-5 py-3 text-white">
                            {formatMAD(order.total)}
                          </td>
                          <td className="px-5 py-3">
                            <span className="chip border-green-500/40 text-green-400">
                              Completed
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <button
                              className="text-xs text-muted hover:text-white"
                              disabled
                            >
                              Refund
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
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-bold text-white">Mock inventory</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 font-medium">Product</th>
                      <th className="px-5 py-3 font-medium">Remaining</th>
                      <th className="px-5 py-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((row) => (
                      <tr key={row.productId} className="border-b border-border/60">
                        <td className="px-5 py-3 font-mono text-xs text-white">
                          {row.productId}
                        </td>
                        <td className="px-5 py-3 text-muted">{row.remaining}</td>
                        <td className="px-5 py-3 text-muted">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <Placeholder
                icon="🔌"
                title="Supplier API"
                text="Connect automated code suppliers to auto-restock inventory. Not connected in Phase 1."
              />
              <Placeholder
                icon="↩"
                title="Refunds"
                text="Review and process customer refund requests. Coming in a later phase."
              />
              <Placeholder
                icon="📦"
                title="Manual fulfillment"
                text="Manually assign codes to orders that need attention. Structure only for now."
              />
              <Placeholder
                icon="👥"
                title="Customers"
                text="Browse customer profiles and order history. Placeholder for now."
              />
            </div>
          </div>
        )}
      </div>
    </div>
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

function Placeholder({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="font-semibold text-white">{title}</h3>
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
          Soon
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}
