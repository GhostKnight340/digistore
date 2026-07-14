"use client";

import { CategoryInfoIcon } from "@/components/category/categoryIcons";
import { useTrackOnView } from "@/hooks/useTrackOnView";
import { WHY_GHOST_ADVANTAGES, TRUST_EVENTS } from "@/lib/trust/content";

/**
 * "Why Ghost.ma" — premium grid of concrete purchasing advantages. Presentational
 * and data-driven (`WHY_GHOST_ADVANTAGES`); reuses the shared category icon set
 * and the existing card/surface idiom so it matches the rest of the storefront.
 * Fires a single view event when scrolled into view.
 */
export default function WhyGhost({
  title = "Pourquoi Ghost.ma",
  subtitle = "Ce qui rend chaque achat simple, clair et sûr.",
  className = "",
}: {
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const ref = useTrackOnView<HTMLElement>(TRUST_EVENTS.whyViewed);

  return (
    <section ref={ref} className={`mt-16 ${className}`}>
      <div className="rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-10 sm:px-11 sm:py-12">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-text">
          {title}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
          {subtitle}
        </p>
        <div className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {WHY_GHOST_ADVANTAGES.map((item) => (
            <article
              key={item.id}
              className="rounded-[14px] border border-border bg-surface2 p-6"
            >
              <span className="mb-[18px] grid h-[42px] w-[42px] place-items-center rounded-[11px] bg-accent-soft text-accent">
                <CategoryInfoIcon name={item.icon} />
              </span>
              <h3 className="text-[15.5px] font-semibold text-text">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
