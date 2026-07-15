import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import GuideIcon from "@/components/guides/GuideIcon";
import NavigatorTip from "@/components/category/NavigatorTip";
import TrackView from "@/components/analytics/TrackView";
import {
  getRankedSearchProducts,
  searchStorefront,
  getActiveCategories,
} from "@/lib/db/catalog";
import { getPublicCollectionCards } from "@/lib/db/collections";
import { getPublishedGuideIndex } from "@/lib/db/guides";
import { categoryHref } from "@/lib/categoryUrl";
import { collectionHref } from "@/lib/collectionUrl";
import { guideHref } from "@/lib/guide";
import { aliasCanonicalTerms } from "@/lib/search/text";

// Fresh per request so results reflect the latest catalogue/guides. Data reads
// stay cached via unstable_cache/CATALOG_TAG/GUIDES_TAG.
export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  // Arbitrary search-result URLs are near-infinite, low-value permutations:
  // never indexed, but links are still followed so product/category/collection/
  // guide pages keep their crawl paths (matches the SEO architecture).
  return {
    title: query ? `Recherche : ${query} - ghost.ma` : "Recherche - ghost.ma",
    robots: { index: false, follow: true },
    alternates: { canonical: "/search" },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (query.length < 2) {
    return <SearchLanding />;
  }

  const [products, groups] = await Promise.all([
    getRankedSearchProducts(query, 48),
    searchStorefront(query, { productLimit: 0 }),
  ]);
  const { categories, collections, guides } = groups;
  const totalResults =
    products.length + categories.length + collections.length + guides.length;

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <TrackView event="search_results_page" params={{ search_term: query }} />

      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Résultats pour « {query} »
        </h1>
        <p className="mt-1 text-sm text-muted">
          {totalResults} résultat{totalResults === 1 ? "" : "s"}
        </p>
      </header>

      {totalResults === 0 ? (
        <NoResults query={query} />
      ) : (
        <div className="space-y-10">
          {products.length > 0 && (
            <section aria-labelledby="search-products">
              <h2
                id="search-products"
                className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
              >
                Produits
              </h2>
              <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          {(categories.length > 0 || collections.length > 0) && (
            <section className="space-y-4" aria-label="Catégories et collections">
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">
                    Catégories
                  </span>
                  {categories.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
              {collections.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">
                    Collections
                  </span>
                  {collections.map((item) => (
                    <Link
                      key={item.slug}
                      href={item.href}
                      className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {guides.length > 0 && (
            <section aria-labelledby="search-guides">
              <h2
                id="search-guides"
                className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
              >
                Guides
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {guides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={guideHref(guide.slug)}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-accent/60 hover:bg-surface"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface2 text-accent">
                      <GuideIcon icon={guide.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white transition group-hover:text-accent">
                        {guide.title}
                      </span>
                      {(guide.platform || guide.summary) && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {guide.platform || guide.summary}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Empty query: a small hint + entry points, no heavy result machinery. */
async function SearchLanding() {
  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Recherche</h1>
        <p className="mt-1 text-sm text-muted">
          Recherchez un produit, une plateforme, une région ou un montant.
        </p>
      </header>
      <NavigatorTip
        tip={{
          enabled: true,
          title: "Astuce de recherche",
          message:
            "Essayez le nom de la plateforme, du produit, de la région ou du montant (ex. « steam 20 eur france »).",
          type: "information",
          ctaLabel: "Parcourir le catalogue",
          ctaUrl: "/products",
        }}
      />
    </div>
  );
}

/** No-result state: suggested spelling/aliases, categories, collections, guides. */
async function NoResults({ query }: { query: string }) {
  const [categories, collections, guides] = await Promise.all([
    getActiveCategories(),
    getPublicCollectionCards(),
    getPublishedGuideIndex(),
  ]);
  // Suggest the canonical spelling when the query trips a known alias.
  const suggestions = aliasCanonicalTerms(query).slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="card px-6 py-12 text-center">
        <p className="text-lg font-semibold text-white">Aucun résultat pour « {query} »</p>
        {suggestions.length > 0 ? (
          <p className="mt-2 text-sm text-muted">
            Essayez plutôt{" "}
            {suggestions.map((term, i) => (
              <span key={term}>
                {i > 0 ? ", " : ""}
                <Link
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  « {term} »
                </Link>
              </span>
            ))}
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Essayez le nom de la plateforme, du produit, de la région ou du montant.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/products" className="btn-primary">
            Voir le catalogue
          </Link>
          <Link href="/support" className="btn-ghost">
            Contacter le support
          </Link>
        </div>
      </div>

      <NavigatorTip
        tip={{
          enabled: true,
          title: "Astuce de recherche",
          message:
            "Essayez le nom de la plateforme, du produit, de la région ou du montant.",
          type: "information",
          ctaLabel: "",
          ctaUrl: "",
        }}
      />

      {categories.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
            Catégories populaires
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.slice(0, 8).map((item) => (
              <Link
                key={item.id}
                href={categoryHref(item)}
                className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {collections.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
            Collections
          </h2>
          <div className="flex flex-wrap gap-2">
            {collections.slice(0, 6).map((item) => (
              <Link
                key={item.slug}
                href={collectionHref(item.slug)}
                className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      {guides.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
            Guides sélectionnés
          </h2>
          <div className="flex flex-wrap gap-2">
            {guides.slice(0, 6).map((guide) => (
              <Link
                key={guide.slug}
                href={guideHref(guide.slug)}
                className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium text-muted transition hover:border-accent hover:text-white"
              >
                {guide.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
