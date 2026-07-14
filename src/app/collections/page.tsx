import type { Metadata } from "next";
import Link from "next/link";
import CollectionCard from "@/components/CollectionCard";
import { getPublicCollectionCards } from "@/lib/db/collections";
import { COLLECTION_URL_PREFIX } from "@/lib/collectionUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collections - ghost.ma",
  description:
    "Parcourez les sélections ghost.ma : tendances, nouveautés, promotions et plus encore.",
  alternates: { canonical: COLLECTION_URL_PREFIX },
};

export default async function CollectionsIndexPage() {
  const collections = await getPublicCollectionCards();

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
        <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {collections.map((collection) => (
            <CollectionCard key={collection.slug} card={collection} source="collections_index" />
          ))}
        </div>
      )}
    </div>
  );
}
