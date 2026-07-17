"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { GuideIndexItem } from "@/lib/types";
import { normalizeSearch } from "@/lib/search/text";
import HelpHero from "./HelpHero";
import CategoryBrowse from "./CategoryBrowse";
import GuideRail from "./GuideRail";
import GuideCard from "./GuideCard";
import HelpCenterEmpty from "./HelpCenterEmpty";
import ReassuranceStrip from "./ReassuranceStrip";

export interface CategorySummary {
  platform: string;
  count: number;
  icon: string;
}

/**
 * Client shell for the Help Center landing. Owns the two discovery controls —
 * a full-text query and a platform filter — and reflects the platform into the
 * URL (`?platform=`, `?q=`) so a filtered view is shareable and survives
 * back/forward. Matching reuses the shared `normalizeSearch` so it is
 * accent/case-insensitive and consistent with the storefront search.
 *
 * When idle it renders discovery surfaces (categories + curated rails + the full
 * list); once the customer searches or picks a platform it collapses to a single
 * ranked results grid (or a helpful empty state). Everything is derived from the
 * existing index payload — no new data is fetched or stored.
 */
export default function HelpCenter({ guides }: { guides: GuideIndexItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const platform = params.get("platform") ?? "";
  const [query, setQuery] = useState(() => params.get("q") ?? "");

  // Keep the platform (and any active query) in the URL so the view is
  // shareable and restored on navigation. `replace` avoids flooding history
  // while typing; picking a platform is a deliberate, shareable state.
  const syncUrl = useCallback(
    (next: { platform?: string; q?: string }) => {
      const sp = new URLSearchParams(params.toString());
      if ("platform" in next) {
        if (next.platform) sp.set("platform", next.platform);
        else sp.delete("platform");
      }
      if ("q" in next) {
        if (next.q) sp.set("q", next.q);
        else sp.delete("q");
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      syncUrl({ q: value });
    },
    [syncUrl],
  );

  const selectPlatform = useCallback(
    (value: string) => {
      syncUrl({ platform: value === platform ? "" : value });
    },
    [platform, syncUrl],
  );

  const resetFilters = useCallback(() => {
    setQuery("");
    syncUrl({ platform: "", q: "" });
  }, [syncUrl]);

  const categories = useMemo<CategorySummary[]>(() => {
    const groups = new Map<string, { count: number; icons: Map<string, number> }>();
    for (const g of guides) {
      if (!g.platform) continue;
      const entry = groups.get(g.platform) ?? { count: 0, icons: new Map() };
      entry.count += 1;
      if (g.icon) entry.icons.set(g.icon, (entry.icons.get(g.icon) ?? 0) + 1);
      groups.set(g.platform, entry);
    }
    return [...groups.entries()]
      .map(([name, { count, icons }]) => {
        // Most common icon within the group, so a category tile looks coherent.
        const icon = [...icons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        return { platform: name, count, icon };
      })
      .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
  }, [guides]);

  const popular = useMemo(() => {
    const featured = guides.filter((g) => g.featured);
    return (featured.length ? featured : guides).slice(0, 6);
  }, [guides]);

  const recent = useMemo(
    () =>
      [...guides]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [guides],
  );

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

  // Live title-match suggestions shown in the hero while typing.
  const suggestions = useMemo(() => {
    if (!nq) return [];
    return guides
      .filter((g) => normalizeSearch(`${g.title} ${g.platform}`).includes(nq))
      .slice(0, 5);
  }, [guides, nq]);

  return (
    <div className="space-y-12 sm:space-y-16">
      <HelpHero
        query={query}
        onQueryChange={onQueryChange}
        suggestions={suggestions}
        categories={categories}
        activePlatform={platform}
        onSelectPlatform={selectPlatform}
      />

      {filtering ? (
        <section aria-labelledby="hc-results" className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="hc-results" className="text-sm font-semibold uppercase tracking-wide text-faint">
              {filtered.length} résultat{filtered.length === 1 ? "" : "s"}
              {platform ? ` · ${platform}` : ""}
            </h2>
            <button
              type="button"
              onClick={resetFilters}
              className="text-[13px] font-medium text-muted transition hover:text-white"
            >
              Réinitialiser
            </button>
          </div>
          {filtered.length === 0 ? (
            <HelpCenterEmpty query={query} popular={popular} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((guide) => (
                <GuideCard key={guide.slug} guide={guide} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {categories.length >= 2 && (
            <CategoryBrowse categories={categories} onSelect={selectPlatform} />
          )}
          {popular.length >= 2 && (
            <GuideRail
              title="Guides populaires"
              subtitle="Les activations les plus consultées"
              guides={popular}
            />
          )}
          {guides.length > 6 && (
            <GuideRail
              title="Récemment mis à jour"
              subtitle="Nos dernières mises à jour"
              guides={recent}
            />
          )}
          <GuideRail title="Tous les guides" guides={guides} />
        </>
      )}

      <ReassuranceStrip />
    </div>
  );
}
