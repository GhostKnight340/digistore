"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import Link from "next/link";
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
const CollectionsPanel = lazy(() => import("@/components/admin/CollectionsPanel"));
const InventoryPanel = lazy(() => import("@/components/admin/InventoryPanel"));
const PaymentsPanel = lazy(() => import("@/components/admin/PaymentsPanel"));
const PaymentMethodsPanel = lazy(() => import("@/components/admin/PaymentMethodsPanel"));
const FulfillmentPanel = lazy(() => import("@/components/admin/FulfillmentPanel"));
const EmailTemplatesPanel = lazy(() => import("@/components/admin/EmailTemplatesPanel"));
const LegalPagesPanel = lazy(() => import("@/components/admin/LegalPagesPanel"));
const MaintenancePanel = lazy(() => import("@/components/admin/MaintenancePanel"));
const GtaPreorderPanel = lazy(() => import("@/components/admin/GtaPreorderPanel"));
const PricingPanel = lazy(() => import("@/components/admin/PricingPanel"));
const ExpensesPanel = lazy(() => import("@/components/admin/ExpensesPanel"));
const PromoCodesPanel = lazy(() => import("@/components/admin/PromoCodesPanel"));
const MilestonesPanel = lazy(() => import("@/components/admin/MilestonesPanel"));
const SupportTicketsPanel = lazy(() => import("@/components/admin/SupportTicketsPanel"));
const GuidesPanel = lazy(() => import("@/components/admin/GuidesPanel"));

const panelFallback = (
  <section className="card p-6 text-sm text-muted">Chargement de la section...</section>
);

function RestoredPanel({
  title,
  eyebrow,
  text,
  href,
  linkLabel,
}: {
  title: string;
  eyebrow: string;
  text: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="card p-6">
      <p className="text-xs uppercase tracking-wide text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{text}</p>
      {href && (
        <Link href={href} className="btn-primary mt-4 inline-flex text-sm">
          {linkLabel ?? "Ouvrir"}
        </Link>
      )}
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
    case "collections":
      return <CollectionsPanel />;
    case "guides":
      return (
        <div className="min-w-0 max-w-full overflow-hidden">
          <GuidesPanel />
        </div>
      );
    case "pricing":
      return <PricingPanel />;
    case "expenses":
      return <ExpensesPanel />;
    case "promo-codes":
      return <PromoCodesPanel />;
    case "milestones":
      return <MilestonesPanel />;
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
    case "gta-preorder":
      return <GtaPreorderPanel />;
    case "orders":
    case "fulfillment":
      return <FulfillmentPanel />;
    case "customers":
      // Clients moved to the dedicated management area at /admin/clients.
      return (
        <RestoredPanel
          title="Clients"
          eyebrow="Section admin"
          text="La gestion des clients dispose désormais de sa propre page."
          href="/admin/clients"
          linkLabel="Ouvrir les clients"
        />
      );
    case "suppliers":
      // Suppliers moved to the dedicated management area at /admin/suppliers
      // (list, per-supplier detail with the Reloadly tooling, purchase logs).
      return (
        <RestoredPanel
          title="Fournisseurs"
          eyebrow="Section admin"
          text="La gestion des fournisseurs dispose désormais de sa propre page."
          href="/admin/suppliers"
          linkLabel="Ouvrir les fournisseurs"
        />
      );
    case "refunds":
      // Refunds moved to the dedicated support/resolution queue at /admin/refunds.
      return (
        <RestoredPanel
          title="Remboursements"
          eyebrow="Section admin"
          text="La file des demandes de remboursement dispose désormais de sa propre page."
          href="/admin/refunds"
          linkLabel="Ouvrir les remboursements"
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
  const sectionParam = searchParams.get("section");
  const [activeTab, setActiveTab] = useState(tabParam ?? "overview");
  const [navCounts, setNavCounts] = useState<NavCounts | null>(null);
  const { settings } = useStoreSettings();
  const inventoryOn = isInventoryEnabled(settings);

  // The URL is the source of truth for the active tab: honor deep links like
  // /admin?tab=orders (standalone routes, the CEO-briefing CTAs) and,
  // crucially, keep browser back/forward correct — navigating back to /admin
  // with no ?tab must fall back to the overview, not leave the last panel shown.
  // setActiveTab with an unchanged value is a no-op, so this stays cheap.
  useEffect(() => {
    setActiveTab(tabParam ?? "overview");
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

  // Deep-link to a specific settings card via ?section=<id> (from the command
  // palette). The target panel is lazy-loaded, so poll briefly until the anchor
  // exists, then scroll it into view and flash it.
  useEffect(() => {
    if (!sectionParam) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tryScroll = () => {
      const el = document.getElementById(sectionParam);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        el.classList.add("admin-section-flash");
        setTimeout(() => el.classList.remove("admin-section-flash"), 1600);
        return;
      }
      if (tries++ < 40) timer = setTimeout(tryScroll, 50);
    };
    tryScroll();
    return () => clearTimeout(timer);
  }, [sectionParam, activeTab]);

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
        <div style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
          <div className="admin-panel-pad" style={{ padding: "26px 28px" }}>
            <style>{`@media (max-width: 640px) { .admin-panel-pad { padding: 16px !important; } }`}</style>
            <Suspense fallback={panelFallback}>{renderPanel(activeTab, inventoryOn)}</Suspense>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
