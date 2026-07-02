import PaymentSettingsPanel from "@/components/admin/PaymentSettingsPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Payment methods" subtitle="Payment methods, banks and review rules.">
      <PaymentSettingsPanel />
    </LegacyPanelScreen>
  );
}
