import type { GuideIndexItem } from "@/lib/types";
import GuideCard from "./GuideCard";

/**
 * A titled row of guide cards, reused for the curated "populaires" / "récents"
 * rails and the full list. Plain presentational markup — takes an already-derived
 * list so it stays trivially reusable.
 */
export default function GuideRail({
  title,
  subtitle,
  guides,
}: {
  title: string;
  subtitle?: string;
  guides: GuideIndexItem[];
}) {
  if (guides.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-faint">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <GuideCard key={guide.slug} guide={guide} />
        ))}
      </div>
    </section>
  );
}
