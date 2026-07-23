import { getStoreSettings } from "@/lib/db/catalog";
import { notFound } from "next/navigation";
import LegalArticle from "@/components/legal/LegalArticle";

export const metadata = { title: "Politique de Remboursement - ghost.ma", alternates: { canonical: "/refunds" } };

export default async function RefundsPage() {
  const settings = await getStoreSettings();
  const page = settings.legalPages.refunds;
  // Hidden by the admin visibility toggle → not publicly reachable.
  if (!page?.published) notFound();
  return <LegalArticle page={page} settings={settings} />;
}
