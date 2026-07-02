import ProductsPanel from "@/components/admin/ProductsPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Products" subtitle="Manage parent products and variants.">
      <ProductsPanel />
    </LegacyPanelScreen>
  );
}
