import { getStoreSettings } from "@/lib/db/catalog";
import { notFound } from "next/navigation";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Mentions légales - ghost.ma", alternates: { canonical: "/legal" } };

export default async function LegalNoticePage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.legal;
  // Hidden by the admin visibility toggle → not publicly reachable.
  if (!page?.published) notFound();
  return <LegalArticle page={page} settings={settings} />;
}
