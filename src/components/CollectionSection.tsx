import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { collectionHref } from "@/lib/collectionUrl";
import type { StorefrontCollection } from "@/lib/types";

/**
 * One homepage collection section: a heading + optional subtitle, a "Voir tout"
 * action, and a responsive grid of the existing ProductCard. Deliberately a
 * grid (not the auto-advancing FeaturedCarousel) so collection rows stay
 * accessible (no autoplay) and keep a compact, premium rhythm. The parent only
 * renders this when the collection has ≥1 eligible product, so it is never
 * empty here.
 */
export default function CollectionSection({
  collection,
  accentByCategory,
}: {
  collection: StorefrontCollection;
  accentByCategory?: Map<string, string>;
}) {
  const href = collectionHref(collection.slug);
  const cta = collection.ctaLabel.trim() || "Voir tout";
  return (
    <section className="mt-7 sm:mt-10">
      <div className="flex items-end justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold tracking-tight text-text">
            {collection.homepageTitle}
          </h2>
          {collection.shortDescription ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {collection.shortDescription}
            </p>
          ) : null}
        </div>
        <Link
          href={href}
          className="hidden shrink-0 text-sm font-medium text-accent hover:text-accent-hover sm:block"
        >
          {cta} →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {collection.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            accent={accentByCategory?.get(product.category)}
          />
        ))}
      </div>
      <Link
        href={href}
        className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover sm:hidden"
      >
        {cta} →
      </Link>
    </section>
  );
}
