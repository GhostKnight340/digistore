import { getStoreSettings } from "@/lib/db/catalog";
import LegalArticle from "@/components/legal/LegalArticle";

export const dynamic = "force-dynamic";

export const metadata = { title: "Politique de Remboursement - ghost.ma" };

export default async function RefundsPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.refunds;
  return <LegalArticle page={page} settings={settings} />;
}
