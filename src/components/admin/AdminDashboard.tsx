"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAdminNavCountsAction } from "@/app/actions/admin";
import AdminShell, { type AdminIdentity, type NavCounts } from "@/components/admin/AdminShell";
import AdminOverview from "@/components/admin/AdminOverview";

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

function renderPanel(activeTab: string) {
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
    case "inventory":
      return <InventoryPanel />;
    case "payment-settings":
      return <PaymentSettingsPanel />;
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
      return (
        <RestoredPanel
          title="API fournisseur"
          eyebrow="Section admin"
          text="Les contrôles de l'API fournisseur sont disponibles ici. Les automatisations existantes restent inchangées."
        />
      );
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
        />
      ) : activeTab === "payments" ? (
        <Suspense fallback={<div style={{ padding: "26px 28px" }}>{panelFallback}</div>}>
          <PaymentsPanel />
        </Suspense>
      ) : (
        <div style={{ height: "100%", overflowY: "auto" }}>
          <div style={{ padding: "26px 28px" }}>
            <Suspense fallback={panelFallback}>{renderPanel(activeTab)}</Suspense>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
