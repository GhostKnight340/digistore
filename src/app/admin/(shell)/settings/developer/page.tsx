import MaintenancePanel from "@/components/admin/MaintenancePanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Developer tools" subtitle="Maintenance, diagnostics and escape hatches.">
      <MaintenancePanel />
    </LegacyPanelScreen>
  );
}
