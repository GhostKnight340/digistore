import { getStoreSettings } from "@/lib/db/catalog";
import LegalArticle from "@/components/legal/LegalArticle";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mentions légales - ghost.ma" };

export default async function LegalNoticePage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.legal;
  return <LegalArticle page={page} settings={settings} />;
}
