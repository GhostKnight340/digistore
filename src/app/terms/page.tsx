import { getStoreSettings } from "@/lib/db/catalog";
import { defaultStoreSettings } from "@/lib/storeSettings";
import LegalArticle from "@/components/legal/LegalArticle";

export const revalidate = 3600;

export const metadata = { title: "Conditions Générales de Vente - ghost.ma" };

export default async function TermsPage() {
  const settings = await getStoreSettings().catch(() => defaultStoreSettings);
  const page = settings.legalPages.terms;
  return <LegalArticle page={page} settings={settings} />;
}
