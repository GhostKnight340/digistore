import Link from "next/link";
import { categories, products } from "@/lib/products";
import { getStorefrontStockStatus } from "@/lib/db/inventory";
import ProductCard from "@/components/ProductCard";

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

  let stockStatus: Record<string, { unused: number; stockControl: string }> = {};
  try { stockStatus = await getStorefrontStockStatus(); } catch { /* DB not configured */ }
  function isOutOfStock(slug: string) {
    const s = stockStatus[slug];
    return !!s && s.stockControl === "auto" && s.unused === 0;
  }

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
          <p className="text-lg font-semibold text-white">Aucun produit trouvé</p>
          <p className="mt-1 text-sm text-muted">
            Essayez une autre catégorie ou un autre terme.
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Réinitialiser
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} outOfStock={isOutOfStock(product.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
