import FeaturedProductsPanel from "@/components/admin/FeaturedProductsPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Featured" subtitle="Curate the homepage Trending now section.">
      <FeaturedProductsPanel />
    </LegacyPanelScreen>
  );
}
