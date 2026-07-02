import InventoryPanel from "@/components/admin/InventoryPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Inventory" subtitle="Stock levels and digital code pools.">
      <InventoryPanel />
    </LegacyPanelScreen>
  );
}
