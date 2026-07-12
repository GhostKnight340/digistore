import type { Metadata } from "next";
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
import {
  getActiveCategories,
  getCatalogPage,
  getCategoryDetail,
  getRegionCounts,
} from "@/lib/db/catalog";
import {
  defaultCategoryLanding,
  hasHero,
  hasLandingContent,
  visibleFaqItems,
  visibleInfoItems,
  type CategoryLanding,
} from "@/lib/categoryLanding";
import type { Category } from "@/lib/types";
import { REGION_LIST } from "@/lib/regions";

export const revalidate = 3600;

type SearchParams = { category?: string; region?: string; q?: string; page?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { category } = await searchParams;
  if (!category) return { title: "Catalogue - ghost.ma" };

  const detail = await getCategoryDetail(category);
  if (!detail) return { title: "Catalogue - ghost.ma" };

  const landing = detail.landing ?? defaultCategoryLanding();
  const title = landing.seo.title || `${detail.name} - ghost.ma`;
  const description = landing.seo.description || detail.description || undefined;
  const canonical = `/products?category=${detail.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      images: landing.seo.imageUrl ? [landing.seo.imageUrl] : undefined,
    },
  };
}

function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { category, region, q, page: rawPage } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(rawPage ?? 1) || 1);

  // Resolve rich landing content only for a clean single-category view (first
  // page, no active search). Any other view stays the plain catalogue it was.
  const categoryDetail =
    category && page === 1 && !query ? await getCategoryDetail(category) : null;
  const landing: CategoryLanding =
    categoryDetail?.landing ?? defaultCategoryLanding();
  const showLanding = Boolean(categoryDetail && hasLandingContent(landing));
  const heroShown = showLanding && hasHero(landing);
  const infoItems = showLanding ? visibleInfoItems(landing) : [];
  const faqItems = showLanding ? visibleFaqItems(landing) : [];

  const [{ categories, products: filtered, total, pageSize }, regionCounts] = await Promise.all([
    getCatalogPage({ category, region, query, page, take: 24 }),
    getRegionCounts({ category, query }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalRegionCount = Object.values(regionCounts).reduce((sum, n) => sum + n, 0);

  // Related categories: admin-curated ids resolved against active categories,
  // current category excluded, ordered by the admin's list. (Dedupe + active
  // filtering come from getActiveCategories + the normalizer.)
  let relatedCategories: Category[] = [];
  if (showLanding && landing.relatedCategoryIds.length > 0 && categoryDetail) {
    const all = await getActiveCategories();
    const byId = new Map(all.map((c) => [c.id, c]));
    relatedCategories = landing.relatedCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is Category => Boolean(c) && c!.id !== categoryDetail.id);
  }

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      {faqItems.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqItems)) }}
        />
      )}

      {/* Top: category hero (own <h1>), a compact landing header, or the plain
          catalogue header — never more than one <h1>. */}
      {heroShown && categoryDetail ? (
        <CategoryHero category={categoryDetail} landing={landing} />
      ) : showLanding && categoryDetail ? (
        <header className="mb-6 pt-4">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {categoryDetail.name}
          </h1>
          {landing.heroSubtitle && (
            <p className="mt-1 text-sm text-muted">{landing.heroSubtitle}</p>
          )}
        </header>
      ) : (
        <header className="mb-8 pt-4">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Catalogue
          </h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} produit{filtered.length === 1 ? "" : "s"}
            {query && (
              <>
                {" "}
                pour <span className="text-white">&quot;{q}&quot;</span>
              </>
            )}
          </p>
        </header>
      )}

      {showLanding && <CategoryIntro intro={landing.introText} />}
      {infoItems.length > 0 && <CategoryInfoPoints items={infoItems} />}
      {showLanding && <NavigatorTip tip={landing.navigatorTip} />}

      {/* Product section — the commerce core. Anchored for the hero CTA. */}
      <section id="products" className="mt-8 scroll-mt-24 sm:mt-10">
        {showLanding && (
          <h2 className="mb-5 text-2xl font-semibold tracking-tight text-text">
            Produits disponibles
            <span className="ml-2 align-middle font-mono text-sm font-normal text-faint">
              {total}
            </span>
          </h2>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={`/products?${new URLSearchParams(region ? { region } : {})}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              !category
                ? "border-accent bg-accent/15 text-white"
                : "border-border text-muted hover:text-white"
            }`}
          >
            Tous
          </Link>
          {categories.map((item) => (
            <Link
              key={item.id}
              href={`/products?${new URLSearchParams({ category: item.id, ...(region ? { region } : {}) })}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                category === item.id
                  ? "border-accent bg-accent/15 text-white"
                  : "border-border text-muted hover:text-white"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">Région</span>
          <Link
            href={`/products?${new URLSearchParams(category ? { category } : {})}`}
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
              href={`/products?${new URLSearchParams({ region: item.code, ...(category ? { category } : {}) })}`}
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
            <p className="text-lg font-semibold text-white">Aucun produit trouvé</p>
            <p className="mt-1 text-sm text-muted">
              Essayez une autre catégorie ou un autre terme.
            </p>
            <Link href="/products" className="btn-primary mt-6">
              Réinitialiser
            </Link>
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
              <Link
                href={`/products?${new URLSearchParams({
                  ...(category ? { category } : {}),
                  ...(region ? { region } : {}),
                  ...(q ? { q } : {}),
                  page: String(page - 1),
                })}`}
                className="btn-ghost h-10 px-4"
              >
                Précédent
              </Link>
            )}
            <span className="text-muted">
              Page {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/products?${new URLSearchParams({
                  ...(category ? { category } : {}),
                  ...(region ? { region } : {}),
                  ...(q ? { q } : {}),
                  page: String(page + 1),
                })}`}
                className="btn-ghost h-10 px-4"
              >
                Suivant
              </Link>
            )}
          </nav>
        )}
      </section>

      {faqItems.length > 0 && (
        <CategoryFaq title="Questions fréquentes" items={faqItems} />
      )}
      {relatedCategories.length > 0 && (
        <RelatedCategories categories={relatedCategories} />
      )}
      {showLanding && <CategoryFinalCta />}
    </div>
  );
}
