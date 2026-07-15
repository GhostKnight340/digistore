import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import TrackView from "@/components/analytics/TrackView";
import TrackedLink from "@/components/gta/TrackedLink";
import CollectionRegionFilter from "@/components/collections/CollectionRegionFilter";
import ShareButton from "@/components/ShareButton";
import { getCollectionBySlug } from "@/lib/db/collections";
import { getActiveCategories } from "@/lib/db/catalog";
import { collectionHref } from "@/lib/collectionUrl";
import { resolveBrandColor } from "@/lib/brandAssets";
import { absoluteUrl } from "@/lib/siteUrl";
import { REGION_LIST } from "@/lib/regions";

// Force-dynamic so the schedule window (start/end) is evaluated at request time
// without a cron — an expired or not-yet-started collection 404s immediately.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ region?: string }>;

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

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const { region } = await searchParams;
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

  const totalCount = collection.products.length;
  const base = collectionHref(collection.slug);

  // Distinct regions present in THIS collection, with counts — the filter never
  // reaches beyond the collection's own products.
  const regionCounts = new Map<string, number>();
  for (const product of collection.products) {
    if (product.region) regionCounts.set(product.region, (regionCounts.get(product.region) ?? 0) + 1);
  }
  const regions = REGION_LIST.filter((item) => regionCounts.has(item.code)).map((item) => ({
    code: item.code,
    count: regionCounts.get(item.code) ?? 0,
  }));
  const activeRegion = region && regionCounts.has(region) ? region : undefined;
  const visibleProducts = activeRegion
    ? collection.products.filter((product) => product.region === activeRegion)
    : collection.products;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Collections", item: absoluteUrl("/collections") },
      { "@type": "ListItem", position: 3, name: collection.name, item: absoluteUrl(base) },
    ],
  };

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <TrackView
        event="view_collection"
        params={{ collection_slug: collection.slug, item_count: totalCount }}
      />

      <nav aria-label="Fil d'Ariane" className="mb-4 text-xs text-faint">
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

      {/* Compact hero — restrained by design (not a full-bleed poster). */}
      <header className="mb-8">
        {collection.imageUrl ? (
          <div className="mb-5 overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={collection.imageUrl} alt="" className="max-h-44 w-full object-cover" />
          </div>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-white">{collection.name}</h1>
        {collection.shortDescription ? (
          <p className="mt-2 max-w-2xl text-sm text-muted">{collection.shortDescription}</p>
        ) : null}
        {collection.longDescription ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            {collection.longDescription}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="font-mono text-xs uppercase tracking-wide text-faint">
            {totalCount} produit{totalCount === 1 ? "" : "s"}
          </span>
          {totalCount > 0 ? (
            <Link href="#products" className="text-sm font-medium text-accent hover:text-accent-hover">
              Voir les produits →
            </Link>
          ) : null}
          <ShareButton
            url={collectionHref(collection.slug)}
            title={`${collection.name} — ghost.ma`}
            text={collection.shortDescription || undefined}
            variant="icon"
          />
        </div>
      </header>

      <section id="products" className="scroll-mt-24">
        {totalCount === 0 ? (
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
          <>
            <CollectionRegionFilter
              base={base}
              slug={collection.slug}
              regions={regions}
              selected={activeRegion}
              totalCount={totalCount}
            />
            <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  accent={accentByCategory.get(product.category)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* CTA back to the complete Catalogue — collections are entry points, not
          exclusive folders. */}
      <section className="mt-14">
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-8 text-center">
          <p className="text-sm text-muted">Vous cherchez autre chose&nbsp;?</p>
          <TrackedLink
            href="/products"
            event="open_catalogue_from_collection"
            params={{ collection_slug: collection.slug }}
            className="btn-ghost h-11 px-6 text-[15px]"
          >
            Explorer tout le catalogue
          </TrackedLink>
        </div>
      </section>
    </div>
  );
}
