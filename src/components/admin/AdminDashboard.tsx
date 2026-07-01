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
const CategoriesPanel = lazy(() => import("@/components/admin/CategoriesPanel"));
const FeaturedProductsPanel = lazy(() => import("@/components/admin/FeaturedProductsPanel"));
const InventoryPanel = lazy(() => import("@/components/admin/InventoryPanel"));
const PaymentsPanel = lazy(() => import("@/components/admin/PaymentsPanel"));
const PaymentSettingsPanel = lazy(() => import("@/components/admin/PaymentSettingsPanel"));
const FulfillmentPanel = lazy(() => import("@/components/admin/FulfillmentPanel"));
const CustomersPanel = lazy(() => import("@/components/admin/CustomersPanel"));
const EmailTemplatesPanel = lazy(() => import("@/components/admin/EmailTemplatesPanel"));
const LegalPagesPanel = lazy(() => import("@/components/admin/LegalPagesPanel"));
const MaintenancePanel = lazy(() => import("@/components/admin/MaintenancePanel"));

const navSections = [
  { title: "Overview", items: [{ id: "overview", label: "Vue d'ensemble", icon: "OV" }] },
  {
    title: "Catalogue",
    items: [
      { id: "products", label: "Produits", icon: "PR" },
      { id: "categories", label: "Catégories", icon: "CA" },
      { id: "featured", label: "Produits populaires", icon: "FP" },
    ],
  },
  {
    title: "Orders",
    items: [
      { id: "orders", label: "Toutes les commandes", icon: "OR" },
      { id: "payments", label: "Revue paiements", icon: "PM" },
      { id: "refunds", label: "Remboursements", icon: "RF" },
    ],
  },
  { title: "Inventory", items: [{ id: "inventory", label: "Stock", icon: "IN" }] },
  { title: "Customers", items: [{ id: "customers", label: "Clients", icon: "CU" }] },
  {
    title: "Settings",
    items: [
      { id: "settings", label: "Boutique", icon: "SS" },
      { id: "payment-settings", label: "Paiements", icon: "PS" },
      { id: "email-templates", label: "Templates email", icon: "EM" },
      { id: "legal-pages", label: "Pages légales", icon: "LG" },
      { id: "maintenance", label: "Maintenance", icon: "MT" },
      { id: "suppliers", label: "API fournisseur", icon: "API" },
      { id: "developer", label: "Developer tools", icon: "DV" },
    ],
  },
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
      setOverviewError("Impossible de charger la vue d'ensemble admin.");
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
    <section className="card p-6 text-sm text-muted">Chargement de la section...</section>
  );

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Tableau de bord admin</h1>
          <p className="mt-1 text-sm text-muted">
            Stock, commandes, paiements et configuration de la boutique.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/editor"
            className="btn-ghost h-10 px-4 text-sm"
          >
            Éditeur de la page d'accueil
          </Link>
          <span className="chip border-accent/40 text-accent">Données de production</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit lg:sticky lg:top-6">
          <nav className="card p-3 text-sm">
            {navSections.map((section, sectionIndex) => (
              <div
                key={section.title}
                className={sectionIndex === 0 ? "space-y-1" : "mt-3 space-y-1 border-t border-border pt-3"}
              >
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-faint">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${
                      activeTab === item.id
                        ? "bg-accent/10 font-medium text-white"
                        : "text-muted hover:bg-surface hover:text-white"
                    }`}
                  >
                    <NavIcon value={item.icon} />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
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
        ) : activeTab === "categories" ? (
          <Suspense fallback={panelFallback}>
            <CategoriesPanel />
          </Suspense>
        ) : activeTab === "featured" ? (
          <Suspense fallback={panelFallback}>
            <FeaturedProductsPanel />
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
        ) : activeTab === "email-templates" ? (
          <Suspense fallback={panelFallback}>
            <EmailTemplatesPanel />
          </Suspense>
        ) : activeTab === "legal-pages" ? (
          <Suspense fallback={panelFallback}>
            <LegalPagesPanel />
          </Suspense>
        ) : activeTab === "maintenance" ? (
          <Suspense fallback={panelFallback}>
            <MaintenancePanel />
          </Suspense>
        ) : activeTab === "orders" ? (
          <Suspense fallback={panelFallback}>
            <FulfillmentPanel />
          </Suspense>
        ) : activeTab === "customers" ? (
          <Suspense fallback={panelFallback}>
            <CustomersPanel />
          </Suspense>
        ) : activeTab === "suppliers" ? (
          <RestoredPanel
            title="API fournisseur"
            eyebrow="Section admin restaurée"
            text="Les contrôles de l'API fournisseur sont disponibles dans la navigation admin. Les automatisations existantes restent inchangées."
          />
        ) : activeTab === "refunds" ? (
          <RestoredPanel
            title="Remboursements"
            eyebrow="Section admin restaurée"
            text="La revue des remboursements est disponible dans la navigation admin. Les paiements et commandes restent synchronisés avec Supabase."
          />
        ) : (
          <div className="space-y-8">
            {overviewError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                <p className="font-semibold text-red-50">Impossible de charger les données admin</p>
                <p className="mt-1">{overviewError}</p>
                <button
                  type="button"
                  onClick={loadOverview}
                  className="mt-2 text-xs font-medium text-red-300 hover:text-white"
                >
                  Réessayer
                </button>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Commandes totales"
                value={overviewLoading ? "..." : stats ? String(stats.totalOrders) : "-"}
              />
              <Stat
                label="À traiter"
                value={overviewLoading ? "..." : stats ? String(stats.pendingCount) : "-"}
              />
              <Stat
                label="Chiffre d'affaires"
                value={overviewLoading ? "..." : stats ? formatMAD(stats.totalRevenue) : "-"}
              />
              <Stat
                label="Clients"
                value={overviewLoading ? "..." : stats ? String(stats.customerCount) : "-"}
              />
            </div>

            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-bold text-white">Commandes récentes</h2>
                  <p className="mt-1 text-xs text-muted">
                    Dernières commandes enregistrées. Ouvrez Commandes ou Paiements pour les files de traitement.
                  </p>
                </div>
                <div className="w-full sm:w-80">
                  <label className="sr-only" htmlFor="admin-order-search">
                    Rechercher une commande
                  </label>
                  <input
                    id="admin-order-search"
                    className="input h-10 py-0 text-sm"
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                    placeholder="Rechercher une commande..."
                  />
                </div>
              </div>
              {overviewLoading ? (
                <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
              ) : recentOrders.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">
                  Aucune commande pour le moment. Passez une commande test pour l'afficher ici.
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted">
                  Aucune commande ne correspond à votre recherche.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted">
                      <tr className="border-b border-border">
                        <th className="px-5 py-3 font-medium">Commande</th>
                        <th className="px-5 py-3 font-medium">Client</th>
                        <th className="px-5 py-3 font-medium">Date</th>
                        <th className="px-5 py-3 font-medium">Total</th>
                        <th className="px-5 py-3 font-medium">Statut</th>
                        <th className="px-5 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id} className="border-b border-border/60">
                          <td className="px-5 py-3 font-mono text-xs text-white">
                            {order.publicOrderNumber}
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
                              {order.status === "delivered" ? "Voir" : "Traiter"}
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
                  <h2 className="font-bold text-white">Alertes de stock</h2>
                  <p className="mt-1 text-xs text-muted">
                    Variantes en stock faible ou en rupture selon les quantités actuelles.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("inventory")}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Gérer les codes
                </button>
              </div>
              {overviewLoading ? (
                <p className="mt-4 text-sm text-muted">Chargement...</p>
              ) : inventoryProducts.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  Aucun code en stock pour le moment. Utilisez Gérer les codes pour ajouter du stock.
                </p>
              ) : inventoryAlerts.length === 0 ? (
                <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                  Toutes les variantes suivies sont en stock.
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
                            ? "En rupture"
                            : `Plus que ${alert.unused} code${alert.unused === 1 ? "" : "s"} disponible${alert.unused === 1 ? "" : "s"}`}
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
