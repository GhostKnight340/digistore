import Link from "next/link";
import { categories, products as staticProducts } from "@/lib/products";
import { getStorefrontStockStatus } from "@/lib/db/inventory";
import { getCatalogFromDB } from "@/lib/db/catalog";
import type { CatalogParent } from "@/lib/db/catalog";
import type { CategoryId, Product } from "@/lib/types";
import { variantTitle } from "@/lib/format";
import ProductCard from "@/components/ProductCard";

export const metadata = {
  title: "Catalogue - Karta",
};

function dbCatalogToProducts(parents: CatalogParent[]): Product[] {
  const out: Product[] = [];
  for (const p of parents) {
    for (const v of p.variants) {
      out.push({
        id: v.slug,
        variantOf: p.slug,
        name: variantTitle(p.name, v.faceValue ?? 0, v.faceCurrency),
        category: p.category as CategoryId,
        brand: p.brand ?? undefined,
        region: p.region,
        deliveryType: p.deliveryType,
        active: v.active && p.active,
        featured: v.featured,
        faceValue: v.faceValue ?? undefined,
        faceCurrency: v.faceCurrency,
        price: v.priceMad,
        description: p.description,
        shortDescription: p.shortDescription ?? undefined,
        longDescription: p.longDescription ?? undefined,
        instructions: p.instructions ?? undefined,
        thumbnail: p.thumbnail ?? undefined,
      });
    }
  }
  return out;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  // Try DB first, fall back to static catalog
  let products: Product[] = staticProducts;
  try {
    const dbParents = await getCatalogFromDB();
    if (dbParents.length > 0) {
      products = dbCatalogToProducts(dbParents).filter((p) => p.active !== false);
    }
  } catch {
    // DB not configured — use static catalog
  }

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
