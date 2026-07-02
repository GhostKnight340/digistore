import CustomersPanel from "@/components/admin/CustomersPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Customers" subtitle="Customer profiles, orders and lifetime value.">
      <CustomersPanel />
    </LegacyPanelScreen>
  );
}
