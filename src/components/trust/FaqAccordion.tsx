"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTrackOnView } from "@/hooks/useTrackOnView";
import { trackEvent } from "@/lib/analytics";
import { TRUST_EVENTS } from "@/lib/trust/content";
import {
  FAQ_ANCHOR_PREFIX,
  FAQ_CATEGORIES,
  faqMatches,
  type FaqCategory,
} from "@/lib/trust/faq";

/**
 * Global FAQ — categorised, searchable, with smooth accessible accordions and
 * deep links to individual questions (`#faq-<slug>`).
 *
 * Accessibility: each answer is always in the DOM (collapsed via a grid-rows
 * transition, not conditional mounting) so it's present for SEO/structured data;
 * buttons carry aria-expanded/aria-controls, are keyboard operable with visible
 * focus, and transitions respect prefers-reduced-motion.
 *
 * Deep links: on mount (and on hashchange) the matching question opens and
 * scrolls into view. Slugs are stable and safe to share in support replies.
 *
 * ADMIN-READY: content comes from `FAQ_CATEGORIES` (src/lib/trust/faq.ts) and can
 * be swapped for an admin-managed source without changing this component.
 */
export default function FaqAccordion({
  categories = FAQ_CATEGORIES,
  title = "Questions fréquentes",
  subtitle = "Tout ce qu'il faut savoir avant et après votre achat.",
  className = "",
}: {
  categories?: FaqCategory[];
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const viewRef = useTrackOnView<HTMLElement>(TRUST_EVENTS.faqViewed);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-link support: open + scroll to the question named in the URL hash.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith(FAQ_ANCHOR_PREFIX)) return;
      const slug = hash.slice(FAQ_ANCHOR_PREFIX.length);
      setOpenSlug(slug);
      // Defer so the row is expanded before we scroll to it.
      requestAnimationFrame(() => {
        document
          .getElementById(hash)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const filtered = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => faqMatches(item, query)),
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, query]);

  const onSearch = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length >= 3) {
      searchTimer.current = setTimeout(() => {
        trackEvent(TRUST_EVENTS.faqSearch, { query_length: value.trim().length });
      }, 600);
    }
  };

  const toggle = (slug: string) => {
    setOpenSlug((current) => {
      const next = current === slug ? null : slug;
      if (next) trackEvent(TRUST_EVENTS.faqOpen, { item_slug: next });
      return next;
    });
  };

  return (
    <section ref={viewRef} id="faq" className={`mt-16 scroll-mt-20 ${className}`}>
      <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>

      <div className="mt-6">
        <label htmlFor="faq-search" className="sr-only">
          Rechercher dans la FAQ
        </label>
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Rechercher une question…"
            className="h-11 w-full rounded-[12px] border border-border bg-surface pl-10 pr-4 text-[14px] text-text placeholder:text-faint focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 rounded-[14px] border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
          Aucune question ne correspond à « {query} ». Contactez le support si
          vous ne trouvez pas votre réponse.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {filtered.map((category) => (
            <div key={category.id}>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">
                {category.label}
              </h3>
              <div className="mt-3 divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
                {category.items.map((item) => (
                  <FaqRow
                    key={item.slug}
                    slug={item.slug}
                    question={item.question}
                    answer={item.answer}
                    open={openSlug === item.slug}
                    onToggle={() => toggle(item.slug)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FaqRow({
  slug,
  question,
  answer,
  open,
  onToggle,
}: {
  slug: string;
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const anchor = `${FAQ_ANCHOR_PREFIX}${slug}`;
  const buttonId = `${anchor}-q`;
  const panelId = `${anchor}-a`;
  return (
    <div id={anchor} className="scroll-mt-24">
      <h4 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-text transition hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span>{question}</span>
          <span
            aria-hidden
            className={`shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h4>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
