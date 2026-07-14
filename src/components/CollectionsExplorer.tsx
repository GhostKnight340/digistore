import Link from "next/link";
import CollectionCard from "@/components/CollectionCard";
import TrackView from "@/components/analytics/TrackView";
import type { HomepageCollectionCard } from "@/lib/types";

/**
 * Homepage "Explorer les collections" section — a single compact grid of
 * collection cards (NOT per-collection product grids). Renders nothing when
 * there are no eligible collections, so the homepage never shows an empty block.
 * Fires one `view_home_collections` analytics event when present.
 */
export default function CollectionsExplorer({
  cards,
  title,
  subtitle,
}: {
  cards: HomepageCollectionCard[];
  title: string;
  subtitle: string;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-12">
      <TrackView event="view_home_collections" params={{ count: cards.length }} />
      <div className="flex items-end justify-between gap-4 sm:gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <Link
          href="/collections"
          className="hidden text-sm font-medium text-accent hover:text-accent-hover sm:block"
        >
          Toutes les collections →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <CollectionCard key={card.slug} card={card} source="homepage" />
        ))}
      </div>
    </section>
  );
}
