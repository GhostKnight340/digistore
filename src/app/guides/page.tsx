import type { Metadata } from "next";
import { Suspense } from "react";
import HelpCenter from "@/components/guides/HelpCenter";
import NavigatorTip from "@/components/category/NavigatorTip";
import { getPublishedGuideIndex } from "@/lib/db/guides";
import { absoluteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guides - ghost.ma",
  description:
    "Guides et tutoriels pour choisir, activer et utiliser vos cartes cadeaux, abonnements et produits numériques en toute confiance.",
  alternates: { canonical: "/guides" },
  openGraph: {
    type: "website",
    url: absoluteUrl("/guides"),
    title: "Guides - ghost.ma",
    description:
      "Guides et tutoriels pour choisir, activer et utiliser vos produits numériques.",
  },
};

export default async function GuidesIndexPage() {
  const guides = await getPublishedGuideIndex();

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      {guides.length === 0 ? (
        <div className="space-y-8 pt-4">
          <header className="mb-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Centre d&apos;aide
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Guides d&apos;activation pour vos cartes cadeaux, abonnements et clés.
            </p>
          </header>
          <div className="card px-6 py-16 text-center">
            <p className="text-lg font-semibold text-white">Bientôt disponible</p>
            <p className="mt-1 text-sm text-muted">
              Nos guides arrivent très prochainement.
            </p>
          </div>
          <NavigatorTip
            tip={{
              enabled: true,
              title: "Astuce",
              message:
                "En attendant, notre support répond à toutes vos questions avant l'achat.",
              type: "information",
              ctaLabel: "Contacter le support",
              ctaUrl: "/support",
            }}
          />
        </div>
      ) : (
        <Suspense fallback={null}>
          <HelpCenter guides={guides} />
        </Suspense>
      )}
    </div>
  );
}
