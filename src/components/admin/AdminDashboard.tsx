"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAdminNavCountsAction } from "@/app/actions/admin";
import AdminShell, {
  ADMIN_STANDALONE_ROUTES,
  type AdminIdentity,
  type NavCounts,
} from "@/components/admin/AdminShell";
import AdminOverview from "@/components/admin/AdminOverview";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { isInventoryEnabled } from "@/lib/storeSettings";

const SettingsPanel = lazy(() => import("@/components/admin/SettingsPanel"));
const ProductsPanel = lazy(() => import("@/components/admin/ProductsPanel"));
const CategoriesPanel = lazy(() => import("@/components/admin/CategoriesPanel"));
const FeaturedProductsPanel = lazy(() => import("@/components/admin/FeaturedProductsPanel"));
const InventoryPanel = lazy(() => import("@/components/admin/InventoryPanel"));
const PaymentsPanel = lazy(() => import("@/components/admin/PaymentsPanel"));
const PaymentMethodsPanel = lazy(() => import("@/components/admin/PaymentMethodsPanel"));
const FulfillmentPanel = lazy(() => import("@/components/admin/FulfillmentPanel"));
const CustomersPanel = lazy(() => import("@/components/admin/CustomersPanel"));
const EmailTemplatesPanel = lazy(() => import("@/components/admin/EmailTemplatesPanel"));
const LegalPagesPanel = lazy(() => import("@/components/admin/LegalPagesPanel"));
const MaintenancePanel = lazy(() => import("@/components/admin/MaintenancePanel"));
const SuppliersPanel = lazy(() => import("@/components/admin/SuppliersPanel"));
const PricingPanel = lazy(() => import("@/components/admin/PricingPanel"));
const ExpensesPanel = lazy(() => import("@/components/admin/ExpensesPanel"));
const SupportTicketsPanel = lazy(() => import("@/components/admin/SupportTicketsPanel"));

const panelFallback = (
  <section className="card p-6 text-sm text-muted">Chargement de la section...</section>
);

function RestoredPanel({ title, eyebrow, text }: { title: string; eyebrow: string; text: string }) {
  return (
    <section className="card p-6">
      <p className="text-xs uppercase tracking-wide text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{text}</p>
    </section>
  );
}

function renderPanel(activeTab: string, inventoryOn: boolean) {
  switch (activeTab) {
    case "settings":
      return <SettingsPanel />;
    case "products":
      return (
        <div className="min-w-0 max-w-full overflow-hidden">
          <ProductsPanel />
        </div>
      );
    case "categories":
      return <CategoriesPanel />;
    case "featured":
      return <FeaturedProductsPanel />;
    case "pricing":
      return <PricingPanel />;
    case "expenses":
      return <ExpensesPanel />;
    case "support":
      return <SupportTicketsPanel />;
    case "inventory":
      return inventoryOn ? (
        <InventoryPanel />
      ) : (
        <RestoredPanel
          title="Système d'inventaire désactivé"
          eyebrow="Section admin"
          text="Le système d'inventaire est désactivé. Réactivez-le depuis Boutique → Système d'inventaire pour gérer le stock."
        />
      );
    case "payments":
      return <PaymentsPanel />;
    case "payment-settings":
      return <PaymentMethodsPanel />;
    case "email-templates":
      return <EmailTemplatesPanel />;
    case "legal-pages":
      return <LegalPagesPanel />;
    case "maintenance":
      return <MaintenancePanel />;
    case "orders":
    case "fulfillment":
      return <FulfillmentPanel />;
    case "customers":
      return <CustomersPanel />;
    case "suppliers":
      return <SuppliersPanel />;
    case "refunds":
      return (
        <RestoredPanel
          title="Remboursements"
          eyebrow="Section admin"
          text="La revue des remboursements est disponible ici. Les paiements et commandes restent synchronisés."
        />
      );
    default:
      return null;
  }
}

export default function AdminDashboard({ admin }: { admin: AdminIdentity }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam ?? "overview");
  const [navCounts, setNavCounts] = useState<NavCounts | null>(null);
  const { settings } = useStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);

  // Honor deep links like /admin?tab=orders (used by standalone routes such as
  // the order-detail page navigating back through the sidebar).
  useEffect(() => {
    if (tabParam && tabParam !== activeTab) setActiveTab(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

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

  function handleNavigate(id: string) {
    // Standalone routes (e.g. the Reloadly importer) are full pages, not panels.
    const standalone = ADMIN_STANDALONE_ROUTES[id];
    if (standalone) {
      router.push(standalone);
      return;
    }
    setActiveTab(id);
    // Keep the URL in sync without a full navigation so refresh/back behave.
    const query = id === "overview" ? "/admin" : `/admin?tab=${id}`;
    router.replace(query, { scroll: false });
  }

  return (
    <AdminShell active={activeTab} onNavigate={handleNavigate} counts={navCounts} admin={admin}>
      {activeTab === "overview" ? (
        <AdminOverview
          firstName={admin.name.trim().split(/\s+/)[0] ?? ""}
          onOpenReviewQueue={() => setActiveTab("payments")}
          onOpenInventory={() => setActiveTab("inventory")}
        />
      ) : (
        <div style={{ height: "100%", overflowY: "auto" }}>
          <div className="admin-panel-pad" style={{ padding: "26px 28px" }}>
            <style>{`@media (max-width: 640px) { .admin-panel-pad { padding: 16px !important; } }`}</style>
            <Suspense fallback={panelFallback}>{renderPanel(activeTab, inventoryOn)}</Suspense>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
