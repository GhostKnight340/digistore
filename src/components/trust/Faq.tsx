"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import TrackSectionView from "@/components/analytics/TrackSectionView";
import {
  usedFaqCategories,
  visibleFaqItems,
  type FaqCategorySetting,
  type FaqItemSetting,
} from "@/lib/trust/content";

/**
 * Searchable, categorized FAQ with smooth accordion animations, keyboard
 * support and deep links to individual questions (`#faq-<id>`). Answers are
 * always in the DOM (collapsed via a CSS grid-rows transition, not conditional
 * mounting) so they are present in the server-rendered HTML for SEO — this
 * component SSRs even though it is a client component.
 *
 * Reusable on the homepage (a focused subset via `limit`), the dedicated /faq
 * page (full, searchable) and any product/campaign page.
 */
export default function Faq({
  categories,
  items,
  title,
  subtitle,
  searchable = true,
  showCategories = true,
  limit,
  className = "mt-16",
  headingLevel = 2,
}: {
  categories: FaqCategorySetting[];
  items: FaqItemSetting[];
  title?: string;
  subtitle?: string;
  searchable?: boolean;
  showCategories?: boolean;
  limit?: number;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const allItems = useMemo(() => {
    const visible = visibleFaqItems(items);
    return typeof limit === "number" ? visible.slice(0, limit) : visible;
  }, [items, limit]);

  const cats = useMemo(
    () => usedFaqCategories(categories, allItems),
    [categories, allItems],
  );

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchTracked = useRef(false);

  // Deep link: open + scroll to the item referenced by the URL hash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("faq-")) return;
    const id = hash.slice(4);
    if (allItems.some((item) => item.id === id)) {
      setOpenId(id);
      // Defer so the row is laid out before scrolling.
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "center" });
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (activeCategory && item.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      return (
        item.question.toLowerCase().includes(normalizedQuery) ||
        item.answer.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [allItems, activeCategory, normalizedQuery]);

  if (allItems.length === 0) return null;

  const Heading = headingLevel === 3 ? "h3" : "h2";

  const onSearchChange = (value: string) => {
    setQuery(value);
    const trimmed = value.trim();
    if (trimmed.length >= 3 && !searchTracked.current) {
      searchTracked.current = true;
      trackEvent("faq_search", { search_term: trimmed });
    }
    if (trimmed.length === 0) searchTracked.current = false;
  };

  return (
    <section
      className={className}
      aria-labelledby={title ? "faq-heading" : undefined}
      aria-label={title ? undefined : "Questions fréquentes"}
    >
      <TrackSectionView event="trust_section_viewed" params={{ section: "faq" }} />

      {title && (
        <div className="max-w-2xl">
          <Heading
            id="faq-heading"
            className="text-2xl font-semibold tracking-tight text-text sm:text-[27px]"
          >
            {title}
          </Heading>
          {subtitle && <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{subtitle}</p>}
        </div>
      )}

      {(searchable || (showCategories && cats.length > 1)) && (
        <div className="mt-6 flex flex-col gap-4">
          {searchable && (
            <div className="relative max-w-md">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Rechercher une question…"
                aria-label="Rechercher dans la FAQ"
                className="input pl-10"
              />
            </div>
          )}

          {showCategories && cats.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
              <CategoryChip
                label="Toutes"
                active={activeCategory === null}
                onClick={() => setActiveCategory(null)}
              />
              {cats.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  label={cat.label}
                  active={activeCategory === cat.id}
                  onClick={() =>
                    setActiveCategory((c) => (c === cat.id ? null : cat.id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Aucune question ne correspond à votre recherche.
          </p>
        ) : (
          filtered.map((item) => (
            <FaqRow
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() =>
                setOpenId((current) => {
                  const next = current === item.id ? null : item.id;
                  if (next) trackEvent("faq_opened", { item_id: item.id });
                  return next;
                })
              }
            />
          ))
        )}
      </div>
    </section>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active
          ? "border-accent bg-accent/10 text-white"
          : "border-border text-muted hover:border-border-strong hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function FaqRow({
  item,
  open,
  onToggle,
}: {
  item: FaqItemSetting;
  open: boolean;
  onToggle: () => void;
}) {
  const base = useId();
  const buttonId = `${base}-q`;
  const panelId = `${base}-a`;

  return (
    <div id={`faq-${item.id}`} className="scroll-mt-24">
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-text transition hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span>{item.question}</span>
          <span
            aria-hidden
            className={`shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted">{item.answer}</p>
        </div>
      </div>
    </div>
  );
}
