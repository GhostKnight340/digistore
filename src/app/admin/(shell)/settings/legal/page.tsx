import LegalPagesPanel from "@/components/admin/LegalPagesPanel";
import LegacyPanelScreen from "@/components/admin/shell/LegacyPanelScreen";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <LegacyPanelScreen title="Legal pages" subtitle="Terms, privacy and legal content.">
      <LegalPagesPanel />
    </LegacyPanelScreen>
  );
}
