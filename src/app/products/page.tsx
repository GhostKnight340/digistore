import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import RegionBadge from "@/components/RegionBadge";
import { getCatalogPage, getCategoryDetail, getRegionCounts, searchStorefront } from "@/lib/db/catalog";
import { categoryHref } from "@/lib/categoryUrl";
import { REGION_LIST } from "@/lib/regions";

// Render fresh on every request (no page-level ISR / CDN caching) so admin
// edits appear immediately. Data reads stay cached via unstable_cache/CATALOG_TAG.
export const dynamic = "force-dynamic";

type SearchParams = { category?: string; region?: string; q?: string; page?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  if (query) {
    // Arbitrary internal search-result URLs are intentionally not indexed (they
    // are low-value, near-infinite query permutations). Links are still
    // followed so product/category/collection pages keep their crawl paths.
    return {
      title: `Recherche : ${query} - ghost.ma`,
      robots: { index: false, follow: true },
    };
  }
  return { title: "Catalogue - ghost.ma" };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { category, region, q, page: rawPage } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(rawPage ?? 1) || 1);

  // A single-category filter now lives at the pretty URL /categorie/<seoSlug>.
  // Permanently redirect legacy ?category= links there (preserving region/page)
  // when the category has an SEO slug; otherwise fall through to a plain filter.
  if (category && !query) {
    const detail = await getCategoryDetail(category);
    if (detail?.seoSlug) {
      const q2 = new URLSearchParams();
      if (region) q2.set("region", region);
      if (page > 1) q2.set("page", String(page));
      const suffix = q2.toString();
      permanentRedirect(`${categoryHref(detail)}${suffix ? `?${suffix}` : ""}`);
    }
  }

  const [{ categories, products: filtered, total, pageSize }, regionCounts, searchGroups] =
    await Promise.all([
      getCatalogPage({ category, region, query, page, take: 24 }),
      getRegionCounts({ category, query }),
      // Only needed to surface matching categories/collections when searching;
      // productLimit 0 skips the product payload (the grid already shows those).
      query ? searchStorefront(query, { productLimit: 0 }) : null,
    ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalRegionCount = Object.values(regionCounts).reduce((sum, n) => sum + n, 0);
  const matchedCategories = searchGroups?.categories ?? [];
  const matchedCollections = searchGroups?.collections ?? [];

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Catalogue</h1>
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

      {query && (matchedCategories.length > 0 || matchedCollections.length > 0) && (
        <div className="mb-6 space-y-3">
          {matchedCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">
                Catégories
              </span>
              {matchedCategories.map((item) => (
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
          {matchedCollections.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono text-xs uppercase tracking-wide text-faint">
                Collections
              </span>
              {matchedCollections.map((item) => (
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
        </div>
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
            href={categoryHref(item)}
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
          <p className="text-lg font-semibold text-white">
            {query ? <>Aucun résultat pour « {q} »</> : "Aucun produit trouvé"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {query
              ? "Essayez le nom de la plateforme, du produit ou de la région."
              : "Essayez une autre catégorie ou un autre terme."}
          </p>
          <Link href="/products" className="btn-primary mt-6">Réinitialiser</Link>
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
          <span className="text-muted">Page {page} / {totalPages}</span>
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
    </div>
  );
}
