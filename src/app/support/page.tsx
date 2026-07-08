import { getStoreSettings } from "@/lib/db/catalog";
import { defaultStoreSettings } from "@/lib/storeSettings";
import LegalArticle from "@/components/legal/LegalArticle";

export const revalidate = 3600;

export const metadata = { title: "Contact & Support - ghost.ma" };

export default async function SupportPage() {
  const settings = await getStoreSettings().catch(() => defaultStoreSettings);
  const page = settings.legalPages.support;
  return <LegalArticle page={page} settings={settings} />;
}
