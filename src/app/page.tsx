import Link from "next/link";
import BrandNav from "@/components/BrandNav";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import TrustStrip from "@/components/TrustStrip";
import { getActiveCategories, getCatalogData, getStoreSettings } from "@/lib/db/catalog";

export const revalidate = 3600;

const steps = [
  { n: 1, title: "Choisissez un produit", text: "Sélectionnez le produit et la quantité." },
  { n: 2, title: "Paiement sécurisé", text: "Renseignez votre e-mail et choisissez un mode de paiement." },
  { n: 3, title: "Recevez votre produit numérique", text: "Votre produit est disponible après confirmation du paiement." },
];

export default async function HomePage() {
  const [{ categories, products }, settings, brandCategories] = await Promise.all([
    getCatalogData(),
    getStoreSettings(),
    getActiveCategories(),
  ]);

  const productsById = new Map(products.map((product) => [product.id, product]));
  const featured = settings.featuredProductIds
    .map((id) => productsById.get(id))
    .filter((product): product is (typeof products)[number] => Boolean(product))
    .filter(
      (product) =>
        settings.featuredOutOfStock === "show" ||
        product.stockStatus !== "out_of_stock",
    );

  return (
    <div className="container-page pb-14 sm:pb-0">
      {/* Ambient blue hero glow — decorative, sits behind all content and ignores pointer events. */}
      <div aria-hidden className="home-hero-glow" />
      {settings.homepage.showHero && (
        <section className="relative py-8 sm:py-14 lg:py-16">
          <div className="relative flex min-w-0 flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div className="order-2 min-w-0 max-w-3xl lg:order-1">
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />
                Produits numériques
              </span>
              <h1 className="mt-5 max-w-xl text-[clamp(2.25rem,10vw,3.4rem)] font-semibold leading-[1.04] text-text sm:mt-6 sm:text-6xl">
                {settings.branding.heroTitle}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted sm:mt-5 sm:text-lg">
                {settings.branding.heroSubtitle}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
                <Link href="/products" className="btn-primary h-12 w-full px-6 text-[15px] sm:w-auto">
                  {settings.branding.primaryCtaLabel}
                </Link>
                <Link href="#how-it-works" className="btn-ghost h-12 w-full px-6 text-[15px] sm:w-auto">
                  {settings.branding.secondaryCtaLabel}
                </Link>
              </div>
            </div>

            {/* Navigator mascot: centered above the headline on mobile (120px,
                no animation), floating to the right on desktop (220px) with a
                faint blue halo. Decorative — the copy carries all meaning. */}
            <div className="home-hero-mascot order-1 shrink-0 lg:order-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/navigator-master-transparent-2048.png"
                alt=""
                width={220}
                height={220}
                className="home-hero-mascot__img h-[120px] w-[120px] sm:h-[180px] sm:w-[180px] lg:h-[220px] lg:w-[220px]"
                fetchPriority="high"
              />
            </div>
          </div>
        </section>
      )}

      {settings.homepage.showBrandNav && brandCategories.length > 0 && (
        <section className="mt-8 sm:mt-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-text">
              {settings.homepage.brandNavTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {settings.homepage.brandNavSubtitle}
            </p>
          </div>
          <BrandNav categories={brandCategories} />
        </section>
      )}

      {settings.homepage.showCategories && (
        <section className="mt-7 sm:mt-10">
          <div className="flex items-end justify-between gap-4 sm:gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                {settings.homepage.categoriesTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {settings.homepage.categoriesSubtitle}
              </p>
            </div>
            <Link href="/products" className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block">
              Tout voir →
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-[18px] min-[390px]:grid-cols-2 md:grid-cols-4">
            {categories.slice(0, 4).map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {settings.homepage.showFeaturedProducts && (
        <section className="mt-7 sm:mt-10">
          <div className="flex items-end justify-between gap-4 sm:gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text">
                {settings.homepage.featuredTitle}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {settings.homepage.featuredSubtitle}
              </p>
            </div>
            <Link href="/products" className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block">
              Tout voir →
            </Link>
          </div>
          {featured.length === 0 ? (
            <div className="card mt-8 px-6 py-12 text-center text-sm text-muted">
              Aucun produit populaire n&apos;est disponible pour le moment.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-5 min-[430px]:grid-cols-2 sm:mt-7 sm:grid-cols-3 lg:grid-cols-4">
              {featured.map((product) => (
                <ProductCard key={product.id} product={product} featured />
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
          <div className="mt-6 flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
            {/* Guide mascot — 130px desktop / 110px tablet, hidden on mobile. */}
            <figure className="hidden shrink-0 md:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/navigator-master-transparent-2048.png"
                alt=""
                width={130}
                height={130}
                className="w-[110px] lg:w-[130px]"
                loading="lazy"
                decoding="async"
              />
              <figcaption className="mt-3 max-w-[130px] text-sm leading-snug text-muted">
                Le Navigateur vous guide à chaque étape
              </figcaption>
            </figure>
            <div className="grid flex-1 gap-4 sm:grid-cols-3">
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
