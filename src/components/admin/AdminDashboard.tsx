"use client";

import Link from "next/link";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusBadgeClass, orderStatusShort } from "@/lib/orderStatus";
import {
  getAdminNavCountsAction,
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
  { title: "Overview", items: [{ id: "overview", label: "Vue d'ensemble" }] },
  {
    title: "Catalogue",
    items: [
      { id: "products", label: "Produits" },
      { id: "categories", label: "Catégories" },
      { id: "featured", label: "Produits populaires" },
    ],
  },
  {
    title: "Orders",
    items: [
      { id: "orders", label: "Toutes les commandes" },
      { id: "payments", label: "Revue paiements" },
      { id: "refunds", label: "Remboursements" },
    ],
  },
  { title: "Inventory", items: [{ id: "inventory", label: "Stock" }] },
  { title: "Customers", items: [{ id: "customers", label: "Clients" }] },
  {
    title: "Settings",
    items: [
      { id: "settings", label: "Boutique" },
      { id: "payment-settings", label: "Paiements" },
      { id: "email-templates", label: "Templates email" },
      { id: "legal-pages", label: "Pages légales" },
      { id: "maintenance", label: "Maintenance" },
      { id: "suppliers", label: "API fournisseur" },
      { id: "developer", label: "Developer tools" },
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
  const [navCounts, setNavCounts] = useState<{
    activeOrders: number;
    paymentReview: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminNavCountsAction()
      .then((counts) => {
        if (!cancelled) setNavCounts(counts);
      })
      .catch((error) => console.error("Failed to load admin nav counts", error));
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

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

      <div className="grid min-w-0 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
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
                {section.items.map((item) => {
                  const badge =
                    item.id === "orders"
                      ? navCounts?.activeOrders
                      : item.id === "payments"
                      ? navCounts?.paymentReview
                      : undefined;
                  return (
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
                      <NavIcon id={item.id} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <span
                          className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                            item.id === "payments"
                              ? "bg-amber-400/90 text-black"
                              : "bg-accent text-white"
                          }`}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
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
            <div className="min-w-0 max-w-full overflow-hidden">
              <ProductsPanel />
            </div>
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

const navIconPaths: Record<string, ReactNode> = {
  // grid of four squares
  overview: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  // package box
  products: (
    <>
      <path d="M21 8.2v7.6a2 2 0 0 1-1 1.73l-7 4.04a2 2 0 0 1-2 0l-7-4.04a2 2 0 0 1-1-1.73V8.2a2 2 0 0 1 1-1.73l7-4.04a2 2 0 0 1 2 0l7 4.04a2 2 0 0 1 1 1.73Z" />
      <path d="M3.3 7.3 12 12.3l8.7-5" />
      <path d="M12 22V12.3" />
    </>
  ),
  // list lines
  categories: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3.5 6h.01" />
      <path d="M3.5 12h.01" />
      <path d="M3.5 18h.01" />
    </>
  ),
  // star
  featured: (
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3Z" />
  ),
  // shopping bag
  orders: (
    <>
      <path d="M6 7h12l1.2 12.2a1.8 1.8 0 0 1-1.8 1.8H6.6a1.8 1.8 0 0 1-1.8-1.8L6 7Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </>
  ),
  // credit card
  payments: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  // rotate/refund arrow
  refunds: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v4.5h4.5" />
    </>
  ),
  // cube
  inventory: (
    <>
      <path d="M21 8.2v7.6a2 2 0 0 1-1 1.73l-7 4.04a2 2 0 0 1-2 0l-7-4.04a2 2 0 0 1-1-1.73V8.2a2 2 0 0 1 1-1.73l7-4.04a2 2 0 0 1 2 0l7 4.04a2 2 0 0 1 1 1.73Z" />
      <path d="M3.3 7.3 12 12.3l8.7-5" />
      <path d="M12 22V12.3" />
    </>
  ),
  // two users
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 15.4c1.7.7 2.7 2.2 3 4.6" />
    </>
  ),
  // gear
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.29 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.62.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
    </>
  ),
  // credit card
  "payment-settings": (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </>
  ),
  // envelope
  "email-templates": (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  // document
  "legal-pages": (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  // wrench
  maintenance: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  // link
  suppliers: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  // code brackets
  developer: (
    <>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
    </>
  ),
};

function NavIcon({ id }: { id: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {navIconPaths[id] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
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
