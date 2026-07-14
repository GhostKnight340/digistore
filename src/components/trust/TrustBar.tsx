import TrackView from "@/components/analytics/TrackView";

/**
 * Compact single-line trust strip (✓ items). Reusable anywhere — under the
 * homepage hero, on product pages, collection and campaign pages — as a quiet
 * reassurance band. Wraps cleanly on small screens (no horizontal overflow)
 * and stays visually restrained (no big colorful badges).
 */

const DEFAULT_ITEMS = [
  "Produits numériques officiels",
  "Paiement sécurisé",
  "Support local marocain",
  "Livraison rapide",
  "Prix transparents",
];

export default function TrustBar({
  items = DEFAULT_ITEMS,
  analyticsEvent = "trust_bar_view",
  className = "mt-6",
}: {
  items?: string[];
  analyticsEvent?: string | null;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      {analyticsEvent ? <TrackView event={analyticsEvent} /> : null}
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 rounded-[14px] border border-border bg-surface/60 px-5 py-3.5">
        {items.map((item) => (
          <li key={item} className="inline-flex items-center gap-2 text-[13px] font-medium text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5BC98C"
              strokeWidth={2.6}
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
