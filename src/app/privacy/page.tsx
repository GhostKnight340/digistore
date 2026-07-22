import { getStoreSettings } from "@/lib/db/catalog";
import { notFound } from "next/navigation";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Politique de Confidentialité - ghost.ma" };

export default async function PrivacyPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.privacy;
  // Hidden by the admin visibility toggle → not publicly reachable.
  if (!page?.published) notFound();
  return <LegalArticle page={page} settings={settings} />;
}
