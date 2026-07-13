import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCollectionListings } from "@/lib/db/collections";
import { collectionHref, COLLECTION_URL_PREFIX } from "@/lib/collectionUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collections - ghost.ma",
  description:
    "Parcourez les sélections ghost.ma : tendances, nouveautés, promotions et plus encore.",
  alternates: { canonical: COLLECTION_URL_PREFIX },
};

export default async function CollectionsIndexPage() {
  const collections = await getPublicCollectionListings();

  return (
    <div className="container-page pt-6 pb-20 sm:py-10">
      <header className="mb-8 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Collections</h1>
        <p className="mt-1 text-sm text-muted">
          Des sélections curatées pour trouver plus vite ce que vous cherchez.
        </p>
      </header>

      {collections.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-lg font-semibold text-white">Aucune collection pour le moment</p>
          <p className="mt-1 text-sm text-muted">Revenez bientôt, ou explorez le catalogue.</p>
          <Link href="/products" className="btn-primary mt-6">
            Voir le catalogue
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <Link
              key={collection.slug}
              href={collectionHref(collection.slug)}
              className="group flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition duration-200 hover:-translate-y-[3px] hover:border-accent/60 hover:shadow-soft"
            >
              {collection.imageUrl ? (
                <div className="aspect-[16/9] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={collection.imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.015]"
                  />
                </div>
              ) : (
                <div className="aspect-[16/9] bg-gradient-to-br from-accent/20 to-surface" />
              )}
              <div className="flex flex-1 flex-col p-5">
                <h2 className="font-medium text-text">{collection.name}</h2>
                {collection.shortDescription ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {collection.shortDescription}
                  </p>
                ) : null}
                <span className="mt-3 text-xs font-mono uppercase tracking-wide text-faint">
                  {collection.productCount} produit{collection.productCount === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
