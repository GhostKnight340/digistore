import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import TrackView from "@/components/analytics/TrackView";
import { getCollectionBySlug } from "@/lib/db/collections";
import { getActiveCategories } from "@/lib/db/catalog";
import { collectionHref } from "@/lib/collectionUrl";
import { resolveBrandColor } from "@/lib/brandAssets";

// Force-dynamic so the schedule window (start/end) is evaluated at request time
// without a cron — an expired or not-yet-started collection 404s immediately.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: "Collection introuvable - ghost.ma" };

  const title = collection.seoTitle || `${collection.name} | ghost.ma`;
  const description =
    collection.seoDescription ||
    collection.shortDescription ||
    `Découvrez la sélection ${collection.name} sur ghost.ma : produits numériques au meilleur prix, livrés après confirmation du paiement.`;
  const canonical = collectionHref(collection.slug);
  const image = collection.socialImageUrl || collection.imageUrl || undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      images: image ? [image] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CollectionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [collection, categories] = await Promise.all([
    getCollectionBySlug(slug),
    getActiveCategories(),
  ]);
  if (!collection) notFound();

  const accentByCategory = new Map(
    categories.map((category) => [
      category.id,
      resolveBrandColor(category.slug ?? category.id, category.accentColor),
    ]),
  );
  const count = collection.products.length;

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <TrackView
        event="view_collection"
        params={{ collection_slug: collection.slug, item_count: count }}
      />

      <nav className="mb-4 text-xs text-faint">
        <Link href="/" className="hover:text-white">
          Accueil
        </Link>
        <span aria-hidden> / </span>
        <Link href="/collections" className="hover:text-white">
          Collections
        </Link>
        <span aria-hidden> / </span>
        <span className="text-muted">{collection.name}</span>
      </nav>

      <header className="mb-8">
        {collection.imageUrl ? (
          <div className="mb-5 overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={collection.imageUrl}
              alt=""
              className="max-h-52 w-full object-cover"
            />
          </div>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {collection.name}
        </h1>
        {collection.shortDescription ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {collection.shortDescription}
          </p>
        ) : null}
        {collection.longDescription ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {collection.longDescription}
          </p>
        ) : null}
        <p className="mt-3 text-xs font-mono uppercase tracking-wide text-faint">
          {count} produit{count === 1 ? "" : "s"}
        </p>
      </header>

      {count === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-lg font-semibold text-white">
            Aucun produit disponible pour le moment
          </p>
          <p className="mt-1 text-sm text-muted">
            Cette collection sera bientôt garnie. Explorez le catalogue en attendant.
          </p>
          <Link href="/products" className="btn-primary mt-6">
            Voir le catalogue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {collection.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              accent={accentByCategory.get(product.category)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
