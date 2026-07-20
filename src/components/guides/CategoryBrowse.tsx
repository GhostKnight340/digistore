"use client";

import GuideIcon from "./GuideIcon";
import type { CategorySummary } from "./HelpCenter";

/**
 * "Parcourir par plateforme" — a grid of category tiles derived from the guides'
 * platform labels. Each tile filters the list in place (no route change). Mirrors
 * the guide/collection card idiom: an icon tile, a name, and a live count.
 */
export default function CategoryBrowse({
  categories,
  onSelect,
}: {
  categories: CategorySummary[];
  onSelect: (platform: string) => void;
}) {
  return (
    <section aria-labelledby="hc-categories">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="hc-categories" className="text-sm font-semibold uppercase tracking-wide text-faint">
          Parcourir par plateforme
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((c) => (
          <button
            key={c.platform}
            type="button"
            onClick={() => onSelect(c.platform)}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-px hover:border-accent/60 hover:bg-surface"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface2 text-accent transition group-hover:border-accent/40">
              <GuideIcon icon={c.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white transition group-hover:text-accent">
                {c.platform}
              </span>
              <span className="block text-xs text-faint">
                {c.count} guide{c.count === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
