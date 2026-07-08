import { getStoreSettings } from "@/lib/db/catalog";
import LegalArticle from "@/components/legal/LegalArticle";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contact & Support - ghost.ma" };

export default async function SupportPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.support;
  return <LegalArticle page={page} settings={settings} />;
}
