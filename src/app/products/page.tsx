import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCatalogData } from "@/lib/db/catalog";

export const metadata = {
  title: "Catalogue - Karta",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const { categories, products } = await getCatalogData();

  let filtered = products;
  if (category) {
    filtered = filtered.filter((product) => product.category === category);
  }
  if (query) {
    filtered = filtered.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query),
    );
  }

  return (
    <div className="container-page py-10">
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

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/products"
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
            href={`/products?category=${item.id}`}
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

      {filtered.length === 0 ? (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <p className="text-lg font-semibold text-white">Aucun produit trouve</p>
          <p className="mt-1 text-sm text-muted">
            Essayez une autre categorie ou un autre terme.
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Reinitialiser
          </Link>
        </div>
      ) : !category && !query ? (
        <div className="space-y-12">
          {categories
            .map((cat) => ({ cat, products: filtered.filter((p) => p.category === cat.id) }))
            .filter(({ products: ps }) => ps.length > 0)
            .map(({ cat, products: ps }) => (
              <section key={cat.id}>
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-white">{cat.name}</h2>
                    {cat.tagline && <p className="mt-0.5 text-sm text-muted">{cat.tagline}</p>}
                  </div>
                  <Link
                    href={`/products?category=${cat.id}`}
                    className="shrink-0 text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    Voir tout &rarr;
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
                  {ps.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
