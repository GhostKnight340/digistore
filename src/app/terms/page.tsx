import { getStoreSettings } from "@/lib/db/catalog";
import { notFound } from "next/navigation";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Conditions Générales de Vente - ghost.ma", alternates: { canonical: "/terms" } };

export default async function TermsPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.terms;
  // Hidden by the admin visibility toggle → not publicly reachable.
  if (!page?.published) notFound();
  return <LegalArticle page={page} settings={settings} />;
}
