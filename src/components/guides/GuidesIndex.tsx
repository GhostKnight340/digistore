"use client";

import { useMemo, useState } from "react";
import type { GuideIndexItem } from "@/lib/types";
import { normalizeSearch } from "@/lib/search/text";
import GuideCard from "./GuideCard";

/**
 * Client-side index for the (bounded) set of published guides: an accessible
 * search box + platform filter over the list, with a featured row shown when no
 * filter/search is active. Reuses the shared `normalizeSearch` so matching is
 * accent/case-insensitive and consistent with the storefront search.
 */
export default function GuidesIndex({ guides }: { guides: GuideIndexItem[] }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>("");

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const g of guides) if (g.platform) set.add(g.platform);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [guides]);

  const nq = normalizeSearch(query);
  const filtering = nq.length > 0 || platform.length > 0;

  const filtered = useMemo(() => {
    return guides.filter((g) => {
      if (platform && g.platform !== platform) return false;
      if (!nq) return true;
      const haystack = normalizeSearch(`${g.title} ${g.summary} ${g.platform}`);
      return haystack.includes(nq);
    });
  }, [guides, nq, platform]);

  const featured = useMemo(() => guides.filter((g) => g.featured).slice(0, 3), [guides]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un guide..."
            aria-label="Rechercher un guide"
            className="h-11 w-full rounded-[10px] border border-border bg-surface pl-10 pr-4 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
        </div>
      </div>

      {platforms.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par plateforme">
          <button
            type="button"
            onClick={() => setPlatform("")}
            aria-pressed={platform === ""}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              platform === ""
                ? "border-accent bg-accent/15 text-white"
                : "border-border text-muted hover:text-white"
            }`}
          >
            Tous
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                platform === p
                  ? "border-accent bg-accent/15 text-white"
                  : "border-border text-muted hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {!filtering && featured.length > 0 && (
        <section aria-labelledby="guides-featured">
          <h2
            id="guides-featured"
            className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
          >
            À la une
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="guides-all">
        <h2
          id="guides-all"
          className="mb-4 text-sm font-semibold uppercase tracking-wide text-faint"
        >
          {filtering ? `${filtered.length} guide${filtered.length === 1 ? "" : "s"}` : "Tous les guides"}
        </h2>
        {filtered.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-sm text-muted">Aucun guide ne correspond à votre recherche.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
