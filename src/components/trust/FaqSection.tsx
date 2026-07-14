"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import type { FaqEntry } from "@/lib/trustContent";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * Searchable, categorised FAQ with accessible accordions and deep links.
 * Content comes from the trust CMS (`settings.trust.faq`).
 *
 * - Search filters questions + answers live across every category.
 * - Category chips narrow the list.
 * - Each answer is always in the DOM (collapsed via a CSS grid-rows transition,
 *   not conditional mounting) so it is present for SEO; the toggle carries
 *   aria-expanded/aria-controls and is keyboard operable.
 * - Deep links: every row has a stable `#faq-<id>` anchor. Landing on such a
 *   URL opens and scrolls to that question. Opening a row updates the hash so
 *   the link can be shared.
 * - Fires `faq_opened` (PII-free, id only) the first time a row is expanded.
 */
export default function FaqSection({ heading }: { heading?: string }) {
  const { settings } = useStoreSettings();
  const categories = settings.trust.faq;

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tracked = useRef<Set<string>>(new Set());

  const { ref } = useInViewOnce<HTMLElement>(() =>
    trackEvent("trust_section_viewed", { section: "faq" }),
  );

  // Deep-link: open + scroll to the targeted question on mount / hash change.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash.startsWith("faq-")) return;
      const id = hash.slice("faq-".length);
      setOpen((prev) => new Set(prev).add(id));
      // Defer to let the row render/expand before scrolling.
      window.setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ block: "center" });
      }, 60);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleCategories = useMemo(() => {
    return categories
      .filter((cat) => activeCat === "all" || cat.id === activeCat)
      .map((cat) => ({
        ...cat,
        entries: cat.entries.filter(
          (entry) =>
            !normalizedQuery ||
            entry.question.toLowerCase().includes(normalizedQuery) ||
            entry.answer.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((cat) => cat.entries.length > 0);
  }, [categories, activeCat, normalizedQuery]);

  if (categories.length === 0) return null;

  const toggle = (entry: FaqEntry) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
        if (!tracked.current.has(entry.id)) {
          tracked.current.add(entry.id);
          trackEvent("faq_opened", { item_id: entry.id });
        }
        if (typeof window !== "undefined" && window.history.replaceState) {
          window.history.replaceState(null, "", `#faq-${entry.id}`);
        }
      }
      return next;
    });
  };

  return (
    <section ref={ref} className="mt-16 scroll-mt-20" id="faq">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text">
          {heading ?? "Questions fréquentes"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Tout ce qu&apos;il faut savoir avant, pendant et après votre achat.
        </p>
      </div>

      {/* Search */}
      <div className="relative mx-auto mt-6 max-w-md">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une question…"
          aria-label="Rechercher dans la FAQ"
          className="input pl-10"
        />
      </div>

      {/* Category chips */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {[{ id: "all", label: "Toutes" }, ...categories].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCat(cat.id)}
            aria-pressed={activeCat === cat.id}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
              activeCat === cat.id
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-border text-muted hover:text-text"
            }`}
          >
            {"label" in cat ? cat.label : ""}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mx-auto mt-8 max-w-3xl space-y-8">
        {visibleCategories.length === 0 ? (
          <p className="text-center text-sm text-muted">
            Aucune question ne correspond à votre recherche.
          </p>
        ) : (
          visibleCategories.map((cat) => (
            <div key={cat.id}>
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">
                {cat.label}
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
                {cat.entries.map((entry) => (
                  <FaqRow
                    key={entry.id}
                    entry={entry}
                    open={open.has(entry.id)}
                    onToggle={() => toggle(entry)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function FaqRow({
  entry,
  open,
  onToggle,
}: {
  entry: FaqEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const buttonId = `faq-${entry.id}`;
  const panelId = `faq-panel-${entry.id}`;
  return (
    <div id={buttonId} className="scroll-mt-24">
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-text transition hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span>{entry.question}</span>
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
            {entry.answer}
          </p>
        </div>
      </div>
    </div>
  );
}
