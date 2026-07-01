import { getStoreSettings } from "@/lib/db/catalog";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Conditions Générales de Vente - ghost.ma" };

export default async function TermsPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.terms;
  return <LegalArticle page={page} settings={settings} />;
}
