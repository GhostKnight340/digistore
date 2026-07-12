import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import RegionBadge from "@/components/RegionBadge";
import CategoryHero from "@/components/category/CategoryHero";
import CategoryIntro from "@/components/category/CategoryIntro";
import CategoryInfoPoints from "@/components/category/CategoryInfoPoints";
import NavigatorTip from "@/components/category/NavigatorTip";
import CategoryFaq from "@/components/category/CategoryFaq";
import RelatedCategories from "@/components/category/RelatedCategories";
import CategoryFinalCta from "@/components/category/CategoryFinalCta";
import { getActiveCategories, getCatalogPage, getRegionCounts } from "@/lib/db/catalog";
import {
  defaultCategoryLanding,
  hasHero,
  visibleFaqItems,
  visibleInfoItems,
} from "@/lib/categoryLanding";
import { categoryHref } from "@/lib/categoryUrl";
import { absoluteUrl } from "@/lib/siteUrl";
import type { Category } from "@/lib/types";
import { REGION_LIST } from "@/lib/regions";

/** Build a pretty-URL string with optional region/page query. */
function pageUrl(base: string, params: { region?: string; page?: number }) {
  const q = new URLSearchParams();
  if (params.region) q.set("region", params.region);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Full category landing page (hero, intro, info, Navigator tip, product grid,
 * FAQ, related, CTA) rendered at the pretty URL `/categorie/<seoSlug>`. All
 * product-section links (region chips, pagination) are built on that pretty
 * base. Emits BreadcrumbList + FAQPage JSON-LD.
 */
export default async function CategoryLandingView({
  category,
  region,
  page,
}: {
  category: Category;
  region?: string;
  page: number;
}) {
  const landing = category.landing ?? defaultCategoryLanding();
  const base = categoryHref(category);
  const heroShown = hasHero(landing);
  const infoItems = visibleInfoItems(landing);
  const faqItems = visibleFaqItems(landing);

  const [{ products: filtered, total, pageSize }, regionCounts] = await Promise.all([
    getCatalogPage({ category: category.id, region, page, take: 24 }),
    getRegionCounts({ category: category.id }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalRegionCount = Object.values(regionCounts).reduce((sum, n) => sum + n, 0);

  let relatedCategories: Category[] = [];
  if (landing.relatedCategoryIds.length > 0) {
    const all = await getActiveCategories();
    const byId = new Map(all.map((c) => [c.id, c]));
    relatedCategories = landing.relatedCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is Category => Boolean(c) && c!.id !== category.id);
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Catalogue", item: absoluteUrl("/products") },
      { "@type": "ListItem", position: 3, name: category.name, item: absoluteUrl(base) },
    ],
  };
  const faqLd =
    faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <div className="container-page pt-4 pb-20 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      {/* Breadcrumb */}
      <nav aria-label="Fil d'Ariane" className="pt-4 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-white">Accueil</Link>
          </li>
          <li aria-hidden className="text-faint">/</li>
          <li>
            <Link href="/products" className="hover:text-white">Catalogue</Link>
          </li>
          <li aria-hidden className="text-faint">/</li>
          <li className="text-text">{category.name}</li>
        </ol>
      </nav>

      {/* Hero (own <h1>) or a compact header when no hero content. */}
      {heroShown ? (
        <CategoryHero category={category} landing={landing} />
      ) : (
        <header className="mb-6 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {category.name}
          </h1>
          {landing.heroSubtitle && (
            <p className="mt-1 text-sm text-muted">{landing.heroSubtitle}</p>
          )}
        </header>
      )}

      <CategoryIntro intro={landing.introText} />
      {infoItems.length > 0 && <CategoryInfoPoints items={infoItems} />}
      <NavigatorTip tip={landing.navigatorTip} />

      {/* Product section — commerce core, anchored for the hero CTA. */}
      <section id="products" className="mt-8 scroll-mt-24 sm:mt-10">
        <h2 className="mb-5 text-2xl font-semibold tracking-tight text-text">
          Produits disponibles
          <span className="ml-2 align-middle font-mono text-sm font-normal text-faint">
            {total}
          </span>
        </h2>

        {/* Region filter (scoped to this category, on the pretty URL). */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">Région</span>
          <Link
            href={base}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              !region
                ? "border-accent bg-accent/15 text-white"
                : "border-border text-muted hover:text-white"
            }`}
          >
            Tous
            <span className="font-mono text-[11px] text-faint">{totalRegionCount}</span>
          </Link>
          {REGION_LIST.filter(
            (item) => (regionCounts[item.code] ?? 0) > 0 || region === item.code,
          ).map((item) => (
            <Link
              key={item.code}
              href={pageUrl(base, { region: item.code })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                region === item.code
                  ? "border-accent bg-accent/15 text-white"
                  : "border-border text-muted hover:text-white"
              }`}
            >
              <RegionBadge code={item.code} variant="chip" size="micro" className="!h-auto !border-0 !bg-transparent !p-0" />
              <span className="font-mono text-[11px] text-faint">{regionCounts[item.code] ?? 0}</span>
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card grid place-items-center px-6 py-20 text-center">
            <p className="text-lg font-semibold text-white">Aucun produit disponible</p>
            <p className="mt-1 text-sm text-muted">Revenez bientôt ou parcourez tout le catalogue.</p>
            <Link href="/products" className="btn-primary mt-6">Voir le catalogue</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
            {page > 1 && (
              <Link href={pageUrl(base, { region, page: page - 1 })} className="btn-ghost h-10 px-4">
                Précédent
              </Link>
            )}
            <span className="text-muted">Page {page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={pageUrl(base, { region, page: page + 1 })} className="btn-ghost h-10 px-4">
                Suivant
              </Link>
            )}
          </nav>
        )}
      </section>

      {faqItems.length > 0 && <CategoryFaq title="Questions fréquentes" items={faqItems} />}
      {relatedCategories.length > 0 && <RelatedCategories categories={relatedCategories} />}
      <CategoryFinalCta />
    </div>
  );
}
