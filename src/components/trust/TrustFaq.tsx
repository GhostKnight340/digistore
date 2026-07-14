"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FAQ_ITEMS, type TrustFaqItem } from "@/lib/trust";
import { trackEvent } from "@/lib/analytics";

/**
 * Searchable, categorized FAQ with accessible accordions and deep links.
 *
 * - Every answer is always in the DOM (collapsed via a CSS grid-rows
 *   transition, never conditionally mounted) so answers are server-rendered
 *   for SEO and reachable by deep links.
 * - `#faq-<id>` in the URL opens and scrolls to that question on load.
 * - Search filters across question + answer; category chips narrow further.
 * - Buttons carry aria-expanded / aria-controls and are keyboard operable;
 *   the transition is disabled under prefers-reduced-motion.
 */
export default function TrustFaq({
  title = "Questions fréquentes",
  subtitle = "Tout ce qu'il faut savoir avant, pendant et après votre achat.",
  items = FAQ_ITEMS,
  className = "mt-16 scroll-mt-20",
}: {
  title?: string;
  subtitle?: string;
  items?: TrustFaqItem[];
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) if (!seen.includes(item.category)) seen.push(item.category);
    return seen;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [items, query, category]);

  // Deep link: open + scroll to #faq-<id> on load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#faq-")) return;
    const id = hash.slice(5);
    if (!items.some((item) => item.id === id)) return;
    setOpenId(id);
    // Defer to after the accordion has rendered its open state.
    requestAnimationFrame(() => {
      document.getElementById(`faq-${id}`)?.scrollIntoView({ block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (value: string) => {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed.length >= 3) trackEvent("trust_faq_search", { length: trimmed.length });
    }, 600);
  };

  const toggle = (item: TrustFaqItem) => {
    setOpenId((current) => {
      const next = current === item.id ? null : item.id;
      if (next) trackEvent("trust_faq_open", { item_id: item.id, category: item.category });
      return next;
    });
  };

  return (
    <section className={className} aria-labelledby="faq-title" id="faq">
      <div>
        <h2 id="faq-title" className="text-2xl font-semibold tracking-tight text-text">
          {title}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted">{subtitle}</p>
      </div>

      {/* Search */}
      <div className="mt-6">
        <label htmlFor="faq-search" className="sr-only">
          Rechercher dans la FAQ
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Rechercher une question…"
            className="input pl-10"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory(null)}
          aria-pressed={category === null}
          className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${
            category === null
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          Tout
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat === category ? null : cat)}
            aria-pressed={category === cat}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${
              category === cat
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <p className="mt-6 rounded-[14px] border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
          Aucune question ne correspond à votre recherche. Contactez notre support, nous vous répondrons.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
          {filtered.map((item) => (
            <FaqRow
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() => toggle(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FaqRow({
  item,
  open,
  onToggle,
}: {
  item: TrustFaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  const buttonId = `faq-${item.id}-q`;
  const panelId = `faq-${item.id}-a`;

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
          <div className="px-5 pb-4">
            <p className="text-[14px] leading-relaxed text-muted">{item.answer}</p>
            <a
              href={`#faq-${item.id}`}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-faint transition hover:text-accent"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              </svg>
              Lien vers cette question
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
