import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import NavigatorTip from "@/components/category/NavigatorTip";
import CategoryFaq from "@/components/category/CategoryFaq";
import TrackView from "@/components/analytics/TrackView";
import PlatformTabs from "@/components/gta/PlatformTabs";
import GtaGiftCard from "@/components/gta/GtaGiftCard";
import ReleaseCountdown from "@/components/gta/ReleaseCountdown";
import TrackedLink from "@/components/gta/TrackedLink";
import {
  getActiveCategories,
  getProductBySlug,
  getProductsByCategorySlug,
} from "@/lib/db/catalog";
import { canonicalBrandKey } from "@/lib/brandAssets";
import {
  GTA_CAMPAIGN_ID,
  GTA_PLATFORMS,
  daysUntilRelease,
  gtaFaqItems,
  gtaPreorderConfig,
  isRecommendableGiftCard,
  isReleased,
  referencedBrandKeys,
  type GtaPlatform,
} from "@/lib/gtaPreorder";
import type { Product } from "@/lib/types";

/**
 * GTA VI pre-order landing page (`/precommande-gta-6`). A premium campaign page
 * that helps Moroccan customers pre-order GTA VI on the official PlayStation /
 * Xbox stores by buying a suitable gift card on Ghost.ma — Ghost.ma never sells
 * the game itself. All content comes from `gtaPreorderConfig`; all product data
 * is resolved live from the catalogue (never hardcoded).
 *
 * Platform selection is server-driven via `selectedPlatform` (from the
 * `?platform=` query), so Back/Forward work and the core content is SSR'd.
 */
export default async function GtaPreorderView({
  selectedPlatform,
  now,
}: {
  selectedPlatform: GtaPlatform | null;
  now: Date;
}) {
  const config = gtaPreorderConfig;

  // Resolve each referenced catalogue brand to its live parent products, so the
  // page shows the REAL PSN / Xbox gift cards already on the site (never a fixed
  // slug list). Empty when a brand has no active/public product.
  const categories = await getActiveCategories();
  const categoryIdByBrand = new Map<string, string>();
  for (const category of categories) {
    const key = canonicalBrandKey(category.slug ?? category.id);
    if (!categoryIdByBrand.has(key)) categoryIdByBrand.set(key, category.id);
  }

  const brandKeys = referencedBrandKeys(config);
  const productsByBrand = new Map<string, Product[]>();
  await Promise.all(
    brandKeys.map(async (brandKey) => {
      const categoryId = categoryIdByBrand.get(brandKey);
      if (!categoryId) {
        productsByBrand.set(brandKey, []);
        return;
      }
      // The category query is variant-flattened; collapse to one card per parent
      // product family (in catalogue order) and resolve each parent live.
      const flat = await getProductsByCategorySlug(categoryId);
      const parentSlugs = [
        ...new Set(flat.map((p) => p.parentId).filter((s): s is string => Boolean(s))),
      ];
      const parents = await Promise.all(parentSlugs.map((slug) => getProductBySlug(slug)));
      productsByBrand.set(
        brandKey,
        parents.filter((p): p is Product => Boolean(p)),
      );
    }),
  );

  // Recommended cards = the brand's store-credit gift cards only. Subscriptions
  // (Xbox Game Pass, PlayStation Plus) can't add the balance needed to pre-order
  // a game, so they are filtered out of the recommendations (they may still show
  // under "Produits associés").
  const platformProducts = (platform: GtaPlatform): Product[] =>
    (productsByBrand.get(config.platforms[platform].brandKey) ?? []).filter(
      (product) => isRecommendableGiftCard(product.name, config),
    );

  // Related: real products from the configured brands, deduped by id.
  const relatedSeen = new Set<string>();
  const relatedProducts: Product[] = [];
  for (const brandKey of config.relatedBrandKeys) {
    for (const product of productsByBrand.get(brandKey) ?? []) {
      if (relatedSeen.has(product.id)) continue;
      relatedSeen.add(product.id);
      relatedProducts.push(product);
    }
  }

  const faqItems = gtaFaqItems(config);
  const released = isReleased(now);
  const daysLeft = daysUntilRelease(now);
  const recommended = selectedPlatform ? platformProducts(selectedPlatform) : [];

  return (
    <div className="container-page pt-4 pb-20 sm:py-8">
      <TrackView event="view_gta_preorder" params={{ campaign: GTA_CAMPAIGN_ID }} />

      {/* Breadcrumb */}
      <nav aria-label="Fil d'Ariane" className="pt-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-white">Accueil</Link>
          </li>
          <li aria-hidden className="text-faint">/</li>
          <li className="text-text">Précommande GTA VI</li>
        </ol>
      </nav>

      {/* 1. HERO */}
      <section className="relative mt-4 overflow-hidden rounded-[22px] border border-border bg-[linear-gradient(158deg,#1d2638_0%,#141a27_52%,#0d1017_100%)] p-6 shadow-soft sm:p-10">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[22px] border border-accent/30 shadow-[inset_0_0_120px_rgba(62,123,250,0.16)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            {config.hero.eyebrow}
          </p>
          <h1 className="mt-3 text-[clamp(1.9rem,6vw,2.8rem)] font-semibold leading-tight tracking-tight text-white">
            {config.hero.heading}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
            {config.hero.subheading}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface2/60 px-3.5 py-1.5 text-[13px] font-medium text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {config.hero.releaseLine}
          </p>
          {!released && (
            <>
              {/* Accessible SSR fallback — the client ticker enhances this. */}
              <p className="sr-only">Sortie dans environ {daysLeft} jours.</p>
              <ReleaseCountdown />
            </>
          )}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="#plateforme" className="btn-primary h-11 px-6 text-[15px]">
              {config.hero.primaryCtaLabel}
              <span aria-hidden>→</span>
            </Link>
            <Link href="#comment" className="btn-ghost h-11 px-6 text-[15px]">
              {config.hero.secondaryCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* 2. OFFICIAL RELEASE INFORMATION */}
      <section className="mt-8 sm:mt-10">
        <div className="grid gap-[14px] sm:grid-cols-3">
          <InfoStrip label="Date de sortie" value={config.releaseInfo.dateLabel} />
          <InfoStrip
            label="Plateformes"
            value={config.releaseInfo.platforms.join(" · ")}
          />
          <InfoStrip
            label="Disponibilité"
            value={config.releaseInfo.availabilityLabel}
          />
        </div>
      </section>

      {/* 3. PLATFORM SELECTOR */}
      <section id="plateforme" className="mt-12 scroll-mt-24 sm:mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Choisissez votre plateforme
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Sélectionnez votre console pour voir les cartes cadeaux recommandées.
        </p>
        <div className="mt-6">
          <PlatformTabs platforms={config.platforms} selected={selectedPlatform} />
        </div>
      </section>

      {/* 4. RECOMMENDED GIFT CARDS */}
      <section id="recommandations" className="mt-10 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Cartes cadeaux recommandées
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Choisissez le montant correspondant au solde dont vous avez besoin.
        </p>

        {!selectedPlatform ? (
          <div className="card mt-6 grid place-items-center px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-white">
              Choisissez d’abord votre plateforme
            </p>
            <p className="mt-1 text-sm text-muted">
              Les cartes recommandées s’affichent une fois PlayStation ou Xbox
              sélectionné.
            </p>
          </div>
        ) : recommended.length === 0 ? (
          <div className="card mt-6 grid place-items-center px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-white">
              Cartes {config.platforms[selectedPlatform].storeName} indisponibles
              pour le moment
            </p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Aucune carte {config.platforms[selectedPlatform].storeName} n’est
              disponible actuellement. Contactez le support ou explorez le
              catalogue.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link href="/support" className="btn-primary h-10 px-5 text-[14px]">
                Contacter le support
              </Link>
              <Link href="/products" className="btn-ghost h-10 px-5 text-[14px]">
                Voir le catalogue
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {recommended.map((product) => (
              <GtaGiftCard
                key={product.id}
                product={product}
                platform={selectedPlatform}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. NAVIGATOR TIP */}
      <NavigatorTip tip={config.navigatorTip} />

      {/* 6. HOW IT WORKS */}
      <section id="comment" className="mt-12 scroll-mt-24 sm:mt-16">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          Comment ça marche
        </h2>
        <div className="mt-6 grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
          {config.howItWorks.map((step) => (
            <article key={step.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 font-mono text-[13px] font-semibold text-accent">
                {step.n}
              </span>
              <h3 className="mt-4 text-[14.5px] font-semibold text-text">
                {step.title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {step.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 7. IMPORTANT DISCLOSURE */}
      <section className="mt-12 sm:mt-16">
        <div className="rounded-[18px] border border-amber-500/25 bg-amber-500/[0.06] p-6 sm:p-7">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-amber-200">
            <span aria-hidden>⚠️</span>
            Information importante
          </h2>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[#d9c7a3]">
            {config.disclosure.body}
          </p>
          <ul className="mt-4 space-y-1.5">
            {config.disclosure.points.map((point) => (
              <li
                key={point}
                className="flex gap-2 text-[13.5px] leading-relaxed text-[#c9bda6]"
              >
                <span aria-hidden className="text-amber-400/80">•</span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <Link href={config.disclosure.refundHref} className="text-accent hover:text-accent-hover">
              Politique de remboursement
            </Link>
            <TrackedLink
              href={config.disclosure.supportHref}
              event="select_support"
              params={{ campaign: GTA_CAMPAIGN_ID, source: "disclosure" }}
              className="text-accent hover:text-accent-hover"
            >
              Support
            </TrackedLink>
            <Link href={config.disclosure.compatibilityHref} className="text-accent hover:text-accent-hover">
              Guide de compatibilité
            </Link>
          </div>
        </div>
      </section>

      {/* 8. FAQ */}
      <CategoryFaq
        title="Questions fréquentes"
        items={faqItems}
        analytics={{ event: "open_faq", params: { campaign: GTA_CAMPAIGN_ID } }}
      />

      {/* 9. RELATED PRODUCTS */}
      {relatedProducts.length > 0 && (
        <section className="mt-12 sm:mt-16">
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            Produits associés
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* 10. FINAL CTA */}
      <section className="mt-12 sm:mt-16">
        <div className="flex flex-col items-center gap-5 rounded-[18px] border border-accent/30 bg-gradient-to-br from-accent/15 to-surface px-6 py-9 text-center sm:py-11">
          <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Prêt à préparer votre précommande&nbsp;?
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            {GTA_PLATFORMS.map((key) => (
              <TrackedLink
                key={key}
                href={`?platform=${key}#recommandations`}
                event="select_platform"
                params={{ campaign: GTA_CAMPAIGN_ID, platform: key, source: "final_cta" }}
                className="btn-primary h-11 px-6 text-[15px]"
              >
                Choisir {key === "playstation" ? "PlayStation" : "Xbox"}
              </TrackedLink>
            ))}
            <TrackedLink
              href="/support"
              event="select_support"
              params={{ campaign: GTA_CAMPAIGN_ID, source: "final_cta" }}
              className="btn-ghost h-11 px-6 text-[15px]"
            >
              Contacter le support
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* Trademark disclaimer */}
      <p className="mt-10 text-center text-[11.5px] leading-relaxed text-faint">
        {config.trademark}
      </p>
    </div>
  );
}

function InfoStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-surface2 p-5">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-semibold text-white">{value}</p>
    </div>
  );
}
