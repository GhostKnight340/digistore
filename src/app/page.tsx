import Link from "next/link";
import BrandNav from "@/components/BrandNav";
import StatStrip from "@/components/StatStrip";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import CollectionsExplorer from "@/components/CollectionsExplorer";
import GtaPreorderBanner from "@/components/gta/GtaPreorderBanner";
import WhyGhost from "@/components/trust/WhyGhost";
import TrustBadges from "@/components/trust/TrustBadges";
import DeliverySteps from "@/components/trust/DeliverySteps";
import CustomerReviews from "@/components/trust/CustomerReviews";
import AcceptedPayments from "@/components/trust/AcceptedPayments";
import FaqAccordion from "@/components/trust/FaqAccordion";
import { getActiveCategories, getCatalogData, getStoreSettings } from "@/lib/db/catalog";
import { getHomepageCollectionCards } from "@/lib/db/collections";
import { resolveBrandColor } from "@/lib/brandAssets";

export const revalidate = 3600;

export default async function HomePage() {
  const [{ categories, products }, settings, brandCategories, collectionCards] =
    await Promise.all([
      getCatalogData(),
      getStoreSettings(),
      getActiveCategories(),
      getHomepageCollectionCards(),
    ]);

  // Brand accent per category id, so product/category cards glow in their
  // brand color instead of a uniform blue.
  const accentByCategory = new Map(
    brandCategories.map((category) => [
      category.id,
      resolveBrandColor(category.slug ?? category.id, category.accentColor),
    ]),
  );
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

      {settings.homepage.showStats && (
        <section className="mt-2 sm:mt-4">
          <StatStrip items={settings.statItems} />
        </section>
      )}

      <section className="mt-4 sm:mt-5">
        <TrustBadges />
      </section>

      <GtaPreorderBanner />

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

      {/* Existing "Produits populaires" (from featuredProductIds) stays first,
          then the curated collection sections, matching the recommended
          homepage order. */}
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
            <div className="mt-6 sm:mt-7">
              <FeaturedCarousel>
                {featured.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    accent={accentByCategory.get(product.category)}
                    featured
                  />
                ))}
              </FeaturedCarousel>
            </div>
          )}
        </section>
      )}

      {settings.homepage.showCollections && (
        <CollectionsExplorer
          cards={collectionCards}
          title={settings.homepage.collectionsTitle}
          subtitle={settings.homepage.collectionsSubtitle}
        />
      )}

      {settings.homepage.showHowItWorks && (
        <DeliverySteps
          id="how-it-works"
          title={settings.homepage.howItWorksTitle}
          subtitle={settings.homepage.howItWorksSubtitle}
        />
      )}

      {settings.homepage.showWhyChooseUs && (
        <WhyGhost
          title={settings.homepage.whyChooseUsTitle}
          subtitle={settings.homepage.whyChooseUsSubtitle}
        />
      )}

      <CustomerReviews />

      <AcceptedPayments />

      <FaqAccordion />

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
