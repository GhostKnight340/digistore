import EmailTemplatesPanel from "@/components/admin/EmailTemplatesPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Email templates" subtitle="Transactional email content.">
      <EmailTemplatesPanel />
    </LegacyPanelScreen>
  );
}
