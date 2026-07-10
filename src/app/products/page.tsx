import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import RegionBadge from "@/components/RegionBadge";
import { getCatalogPage, getRegionCounts } from "@/lib/db/catalog";
import { REGION_LIST } from "@/lib/regions";

export const revalidate = 3600;

export const metadata = {
  title: "Catalogue - ghost.ma",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; region?: string; q?: string; page?: string }>;
}) {
  const { category, region, q, page: rawPage } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const [{ categories, products: filtered, total, pageSize }, regionCounts] = await Promise.all([
    getCatalogPage({
      category,
      region,
      query,
      page,
      take: 24,
    }),
    getRegionCounts(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalRegionCount = Object.values(regionCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="container-page pt-10 pb-20 sm:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Catalogue
        </h1>
        <p className="mt-1 text-sm text-muted">
          {filtered.length} produit{filtered.length === 1 ? "" : "s"}
          {query && (
            <>
              {" "}
              pour <span className="text-white">"{q}"</span>
            </>
          )}
        </p>
      </header>

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
    </div>
  );
}
