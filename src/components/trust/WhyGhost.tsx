"use client";

import { useStoreSettings } from "@/context/StoreSettingsContext";
import { CategoryInfoIcon } from "@/components/category/categoryIcons";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * "Pourquoi ghost.ma" — premium concrete-advantage grid (icon + title +
 * explanation). Content and enable flags come from the trust CMS
 * (`settings.trust.whyGhost`), so advantages are admin-editable later.
 * Reuses the approved category icon set and the storefront card idiom.
 *
 * Fires a single `trust_section_viewed` analytics event when scrolled into view.
 */
export default function WhyGhost({ heading }: { heading?: string }) {
  const { settings } = useStoreSettings();
  const { ref } = useInViewOnce<HTMLElement>(() =>
    trackEvent("trust_section_viewed", { section: "why_ghost" }),
  );
  const items = settings.trust.whyGhost.filter((item) => item.enabled);
  if (items.length === 0) return null;

  return (
    <section ref={ref} className="mt-16">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-[28px]">
          {heading ?? "Pourquoi choisir ghost.ma ?"}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Des avantages concrets, pensés pour l&apos;achat de produits numériques au
          Maroc.
        </p>
      </div>
      <div className="mt-10 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-[16px] border border-border bg-surface2 p-6 transition hover:border-border-strong"
          >
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-[12px] bg-accent-soft text-accent">
              <CategoryInfoIcon name={item.icon} />
            </span>
            <h3 className="text-[15.5px] font-semibold text-text">{item.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
