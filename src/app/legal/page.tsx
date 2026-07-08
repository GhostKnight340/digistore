import { getStoreSettings } from "@/lib/db/catalog";
import { defaultStoreSettings } from "@/lib/storeSettings";
import LegalArticle from "@/components/legal/LegalArticle";

export const revalidate = 3600;

export const metadata = { title: "Mentions légales - ghost.ma" };

export default async function LegalNoticePage() {
  const settings = await getStoreSettings().catch(() => defaultStoreSettings);
  const page = settings.legalPages.legal;
  return <LegalArticle page={page} settings={settings} />;
}
