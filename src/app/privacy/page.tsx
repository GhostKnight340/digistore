import { getStoreSettings } from "@/lib/db/catalog";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Politique de Confidentialité - ghost.ma" };

export default async function PrivacyPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.privacy;
  return <LegalArticle page={page} settings={settings} />;
}
