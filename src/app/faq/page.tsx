import type { Metadata } from "next";
import Link from "next/link";
import Faq from "@/components/trust/Faq";
import FaqJsonLd from "@/components/trust/FaqJsonLd";
import DeliverySteps from "@/components/trust/DeliverySteps";
import AcceptedPayments from "@/components/trust/AcceptedPayments";
import TrustBadges from "@/components/trust/TrustBadges";
import { getStoreSettings } from "@/lib/db/catalog";
import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { absoluteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Questions fréquentes - ghost.ma",
  description:
    "Livraison, paiements, régions, remboursements et support : toutes les réponses avant d'acheter vos produits numériques sur ghost.ma.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const [settings, paymentConfig] = await Promise.all([
    getStoreSettings(),
    getPublicPaymentMethods().catch(() => ({ methods: [] })),
  ]);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "FAQ", item: absoluteUrl("/faq") },
    ],
  };

  return (
    <div className="container-page pt-8 pb-20 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <FaqJsonLd items={settings.faqItems} />

      <nav className="mb-8 flex flex-wrap items-center gap-2 text-[13.5px] text-faint">
        <Link href="/" className="text-muted transition hover:text-white">
          Accueil
        </Link>
        <span>/</span>
        <span className="text-text">FAQ</span>
      </nav>

      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          {settings.homepage.faqTitle}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Vous ne trouvez pas votre réponse ? Notre support local reste disponible en français et
          en arabe.{" "}
          <Link href="/support" className="font-medium text-accent hover:text-accent-hover">
            Contacter le support
          </Link>
          .
        </p>
      </header>

      <div className="mt-7">
        <TrustBadges items={settings.trustItems} />
      </div>

      <Faq
        categories={settings.faqCategories}
        items={settings.faqItems}
        className="mt-10"
      />

      {settings.homepage.showDelivery && (
        <DeliverySteps
          steps={settings.deliverySteps}
          title={settings.homepage.deliveryTitle}
          subtitle={settings.homepage.deliverySubtitle}
        />
      )}

      {settings.homepage.showPaymentMethods && (
        <AcceptedPayments
          initialMethods={paymentConfig.methods}
          title={settings.homepage.paymentMethodsTitle}
          subtitle={settings.homepage.paymentMethodsSubtitle}
        />
      )}
    </div>
  );
}
