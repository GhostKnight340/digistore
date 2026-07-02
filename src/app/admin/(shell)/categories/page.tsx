import CategoriesPanel from "@/components/admin/CategoriesPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Categories" subtitle="Organise products into storefront categories.">
      <CategoriesPanel />
    </LegacyPanelScreen>
  );
}
