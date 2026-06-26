"use client";

import Link from "next/link";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import TrustStrip from "@/components/TrustStrip";
import HeroDeliveryCard from "@/components/HeroDeliveryCard";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useProductCatalog } from "@/context/ProductCatalogContext";

const steps = [
  { n: 1, title: "Choisissez un produit", text: "Selectionnez une carte et la quantite." },
  { n: 2, title: "Paiement securise", text: "Entrez votre email et payez simplement." },
  { n: 3, title: "Recevez le code", text: "Votre code apparait apres confirmation." },
];

export default function HomePage() {
  const { settings } = useStoreSettings();
  const { categories, products } = useProductCatalog();
  const featured =
    settings.featuredProductIds.length > 0
      ? settings.featuredProductIds
          .map((id) => products.find((product) => product.id === id))
          .filter((product): product is (typeof products)[number] => Boolean(product))
      : products.filter((product) => product.featured);

  return (
    <div className="container-page">
      {settings.homepage.showHero && (
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-14">
            <div>
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />
                Cartes &amp; codes numeriques
              </span>
              <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.035em] text-text sm:text-6xl">
                {settings.branding.heroTitle}
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                {settings.branding.heroSubtitle}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/products" className="btn-primary h-12 px-6 text-[15px]">
                  {settings.branding.primaryCtaLabel}
                </Link>
                <Link href="#how-it-works" className="btn-ghost h-12 px-6 text-[15px]">
                  {settings.branding.secondaryCtaLabel}
                </Link>
              </div>
            </div>
            <HeroDeliveryCard />
          </div>
        </section>
      )}

      {settings.homepage.showCategories && (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                {settings.homepage.categoriesTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {settings.homepage.categoriesSubtitle}
              </p>
            </div>
            <Link href="/products" className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block">
              Tout voir -&gt;
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-[18px] md:grid-cols-4">
            {categories.slice(0, 4).map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {settings.homepage.showFeaturedProducts && (
        <section className="mt-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                {settings.homepage.featuredTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {settings.homepage.featuredSubtitle}
              </p>
            </div>
            <Link href="/products" className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block">
              Tout voir -&gt;
            </Link>
          </div>
          {featured.length === 0 ? (
            <div className="card mt-8 px-6 py-12 text-center text-sm text-muted">
              Aucun produit populaire n'est disponible pour le moment.
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      )}

      {settings.homepage.showHowItWorks && (
        <section id="how-it-works" className="mt-16 scroll-mt-20">
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            {settings.homepage.howItWorksTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {settings.homepage.howItWorksSubtitle}
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
            {settings.homepage.ctaTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {settings.homepage.ctaSubtitle}
          </p>
          <Link href="/products" className="btn-primary mt-6">
            {settings.branding.primaryCtaLabel}
          </Link>
        </div>
      </section>
    </div>
  );
}
