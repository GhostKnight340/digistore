"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { categories } from "@/lib/products";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import TrustStrip from "@/components/TrustStrip";
import HeroDeliveryCard from "@/components/HeroDeliveryCard";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import {
  getStorefrontFeaturedAction,
  getStorefrontProductsByIdsAction,
  getCategoryCountsAction,
  getCategoryStockStatusesAction,
} from "@/app/actions/storefront";
import type { Product, StockStatus } from "@/lib/types";

const steps = [
  {
    n: 1,
    title: "Choisissez un produit",
    text: "Sélectionnez une carte et la quantité.",
  },
  {
    n: 2,
    title: "Paiement sécurisé",
    text: "Entrez votre email et payez simplement.",
  },
  {
    n: 3,
    title: "Recevez le code",
    text: "Votre code apparaît instantanément.",
  },
];

export default function HomePage() {
  const { settings } = useStoreSettings();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [autoStockStatuses, setAutoStockStatuses] = useState<Record<string, StockStatus>>({});
  const [countsReady, setCountsReady] = useState(false);

  useEffect(() => {
    Promise.all([
      getCategoryCountsAction(),
      getCategoryStockStatusesAction(),
    ]).then(([counts, stockStatuses]) => {
      setCategoryCounts(counts);
      setAutoStockStatuses(stockStatuses);
      setCountsReady(true);
    });

    if (settings.featuredProductIds.length > 0) {
      getStorefrontProductsByIdsAction(settings.featuredProductIds).then(setFeatured);
    } else {
      getStorefrontFeaturedAction().then(setFeatured);
    }
  }, [settings.featuredProductIds]);

  return (
    <>
      {settings.homepage.showHero && (
        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at top right, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.10) 20%, rgba(59,130,246,0.05) 40%, rgba(59,130,246,0.02) 60%, transparent 80%)",
            }}
          />
          <div className="container-page">
            <section className="relative py-16 sm:py-24">
          <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
            <div>
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />
                Cartes &amp; codes numériques
              </span>
              <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-text sm:text-6xl">
                {settings.branding.heroTitle}
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                {settings.branding.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/products"
                  className="btn-primary h-12 px-6 text-[15px]"
                >
                  {settings.branding.primaryCtaLabel}
                </Link>
                <Link
                  href="#how-it-works"
                  className="btn-ghost h-12 px-6 text-[15px]"
                >
                  {settings.branding.secondaryCtaLabel}
                </Link>
              </div>
              {settings.homepage.showTrustStrip && (
              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
                {[
                  "Livraison instantanée",
                  "Paiement sécurisé",
                  "Support local",
                ].map((text) => (
                  <span
                    key={text}
                    className="flex items-center gap-2 text-sm text-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      className="h-4 w-4 text-accent"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  {text}
                </span>
              ))}
            </div>
              )}
            </div>

            <HeroDeliveryCard />
          </div>
            </section>
          </div>
        </div>
      )}

      <div className="container-page">
      {settings.homepage.showCategories && (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                Catégories populaires
              </h2>
              <p className="mt-1 text-sm text-muted">
                Les plateformes les plus demandées au Maroc.
              </p>
            </div>
            <Link
              href="/products"
              className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
            >
              Tout voir -&gt;
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-[18px] md:grid-cols-4">
            {(countsReady
              ? categories.filter((cat) => (categoryCounts[cat.id] ?? 0) > 0)
              : categories
            ).slice(0, 4).map((category) => {
              const mode = settings.categoryStockModes?.[category.id] ?? "automatic";
              const autoStatus = autoStockStatuses[category.id];
              const stockStatus: StockStatus | undefined = countsReady
                ? mode === "force_in_stock"
                  ? "in_stock"
                  : mode === "force_out_of_stock"
                  ? "out_of_stock"
                  : autoStatus
                : undefined;
              return (
                <CategoryCard
                  key={category.id}
                  category={category}
                  count={categoryCounts[category.id]}
                  thumbnail={settings.categoryMedia?.[category.id]}
                  stockStatus={stockStatus}
                />
              );
            })}
          </div>
        </section>
      )}

      {settings.homepage.showFeaturedProducts && (
        <section className="mt-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                Produits populaires
              </h2>
              <p className="mt-1 text-sm text-muted">
                Sélection vérifiée, codes livrés par email.
              </p>
            </div>
            <Link
              href="/products"
              className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
            >
              Tout voir -&gt;
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
            {(settings.featuredOutOfStock === "hide"
              ? featured.filter((p) => p.stockStatus === "in_stock")
              : featured
            ).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {settings.homepage.showHowItWorks && (
        <section id="how-it-works" className="mt-16 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            Comment ça marche
          </h2>
          <p className="mt-1 text-sm text-muted">
            Trois étapes, en moins d'une minute.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.n} className="card p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-lg font-bold text-accent">
                  {step.n}
                </span>
                <h3 className="mt-4 font-semibold text-white">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {settings.homepage.showWhyChooseUs && <TrustStrip />}

      <section className="mt-16">
        <div className="relative overflow-hidden rounded-[20px] border border-accent/30 bg-gradient-to-br from-accent/20 to-surface px-6 py-12 text-center sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            Prêt à jouer?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Choisissez une carte et recevez votre code en quelques secondes.
          </p>
          <Link href="/products" className="btn-primary mt-6">
            {settings.branding.primaryCtaLabel}
          </Link>
        </div>
      </section>
      </div>
    </>
  );
}
