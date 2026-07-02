import SettingsPanel from "@/components/admin/SettingsPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Store settings" subtitle="Branding and global store configuration.">
      <SettingsPanel />
    </LegacyPanelScreen>
  );
}
