"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  CategorySearchResult,
  CollectionSearchResult,
  GuideSearchResult,
  ProductSearchResult,
} from "@/lib/types";
import { formatDH } from "@/lib/format";
import { getRegion } from "@/lib/regions";
import { trackEvent } from "@/lib/analytics";
import RegionBadge from "./RegionBadge";

type Variant = "desktop" | "mobile";

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

type FlatOption =
  | { index: number; kind: "product"; data: ProductSearchResult }
  | { index: number; kind: "category"; data: CategorySearchResult }
  | { index: number; kind: "collection"; data: CollectionSearchResult }
  | { index: number; kind: "guide"; data: GuideSearchResult }
  | { index: number; kind: "viewall" };

export default function HeaderSearch({
  variant,
  autoFocus = false,
}: {
  variant: Variant;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listboxId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const noResultTracked = useRef<string>("");

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [categories, setCategories] = useState<CategorySearchResult[]>([]);
  const [collections, setCollections] = useState<CollectionSearchResult[]>([]);
  const [guides, setGuides] = useState<GuideSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY;
  const showDropdown = open && ready;
  const totalResults =
    products.length + categories.length + collections.length + guides.length;

  // A single flat option list backs the combobox: one contiguous index space
  // across all three groups plus the trailing "view all" row, so keyboard
  // navigation and aria-activedescendant work seamlessly across groups.
  const flat = useMemo<FlatOption[]>(() => {
    const out: FlatOption[] = [];
    products.forEach((data) => out.push({ index: out.length, kind: "product", data }));
    categories.forEach((data) => out.push({ index: out.length, kind: "category", data }));
    collections.forEach((data) => out.push({ index: out.length, kind: "collection", data }));
    guides.forEach((data) => out.push({ index: out.length, kind: "guide", data }));
    if (hasMore && products.length > 0) out.push({ index: out.length, kind: "viewall" });
    return out;
  }, [products, categories, collections, guides, hasMore]);

  const goToSearch = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
    trackEvent("search", { search_term: trimmed });
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [router, trimmed]);

  const selectOption = useCallback(
    (option: FlatOption) => {
      if (option.kind === "viewall") {
        goToSearch();
        return;
      }
      setOpen(false);
      inputRef.current?.blur();
      trackEvent("select_search_result", {
        search_term: trimmed,
        result_type: option.kind,
      });
      router.push(option.data.href);
    },
    [goToSearch, router, trimmed],
  );

  // Debounced fetch. Aborts the in-flight request on each keystroke and ignores
  // stale responses so results always match the latest query.
  useEffect(() => {
    if (!ready) {
      setProducts([]);
      setCategories([]);
      setCollections([]);
      setGuides([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search_failed");
        const data = (await res.json()) as {
          products?: ProductSearchResult[];
          categories?: CategorySearchResult[];
          collections?: CollectionSearchResult[];
          guides?: GuideSearchResult[];
          hasMore?: boolean;
        };
        const nextProducts = data.products ?? [];
        const nextCategories = data.categories ?? [];
        const nextCollections = data.collections ?? [];
        const nextGuides = data.guides ?? [];
        setProducts(nextProducts);
        setCategories(nextCategories);
        setCollections(nextCollections);
        setGuides(nextGuides);
        setHasMore(Boolean(data.hasMore));
        // Fire a no-results event once per distinct empty query.
        if (
          nextProducts.length +
            nextCategories.length +
            nextCollections.length +
            nextGuides.length ===
            0 &&
          noResultTracked.current !== trimmed
        ) {
          noResultTracked.current = trimmed;
          trackEvent("search_no_results", { search_term: trimmed });
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setProducts([]);
        setCategories([]);
        setCollections([]);
        setGuides([]);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, ready]);

  // Reset the keyboard highlight whenever the option set changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [flat.length]);

  // Close on route change (e.g. after opening a result).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Click / tap outside closes the dropdown; interactions inside keep it open.
  useEffect(() => {
    if (!showDropdown) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showDropdown]);

  // Ctrl/Cmd+K focuses the desktop search from anywhere.
  useEffect(() => {
    if (variant !== "desktop") return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showDropdown || flat.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = current + delta;
        if (next < 0) return flat.length - 1;
        if (next >= flat.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < flat.length) {
        event.preventDefault();
        selectOption(flat[activeIndex]);
      } else if (flat.length > 0 && flat[0].kind !== "viewall") {
        // Enter with nothing highlighted opens the top relevant result.
        event.preventDefault();
        selectOption(flat[0]);
      } else if (ready) {
        event.preventDefault();
        goToSearch();
      }
    }
  }

  const wrapperClass =
    variant === "desktop"
      ? "relative hidden h-10 max-w-[440px] flex-1 items-center md:flex"
      : "relative w-full";
  const inputClass =
    variant === "desktop"
      ? "h-full w-full rounded-[10px] border border-border bg-surface pl-10 pr-4 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
      : "h-10 w-full rounded-[10px] border border-border bg-surface pl-10 pr-4 text-sm text-text outline-none transition placeholder:text-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/25";

  const optId = (index: number) => `${listboxId}-opt-${index}`;

  return (
    <div ref={containerRef} className={wrapperClass}>
      <form
        role="search"
        className="relative flex h-full w-full items-center"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) goToSearch();
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          type="search"
          name="q"
          placeholder={
            variant === "desktop"
              ? "Rechercher un produit numérique..."
              : "Rechercher..."
          }
          className={inputClass}
          aria-label="Rechercher des produits"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optId(activeIndex) : undefined}
          autoComplete="off"
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
      </form>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Résultats de recherche"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(72vh,460px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-card"
        >
          {/* aria-live count for assistive tech */}
          <span className="sr-only" role="status" aria-live="polite">
            {loading
              ? "Recherche en cours"
              : `${totalResults} résultat${totalResults === 1 ? "" : "s"}`}
          </span>

          {loading && totalResults === 0 ? (
            <SkeletonRows />
          ) : totalResults === 0 ? (
            <EmptyState query={trimmed} onCatalogue={goToSearch} />
          ) : (
            <div className="py-1.5">
              {products.length > 0 && (
                <Group label="Produits">
                  <ul>
                    {flat
                      .filter((o): o is Extract<FlatOption, { kind: "product" }> => o.kind === "product")
                      .map((option) => (
                        <ProductRow
                          key={option.data.id}
                          id={optId(option.index)}
                          result={option.data}
                          active={activeIndex === option.index}
                          onSelect={() => selectOption(option)}
                          onHover={() => setActiveIndex(option.index)}
                        />
                      ))}
                  </ul>
                </Group>
              )}

              {categories.length > 0 && (
                <Group label="Catégories">
                  <ul>
                    {flat
                      .filter((o): o is Extract<FlatOption, { kind: "category" }> => o.kind === "category")
                      .map((option) => (
                        <SimpleRow
                          key={`cat-${option.data.id}`}
                          id={optId(option.index)}
                          label={option.data.name}
                          icon="category"
                          active={activeIndex === option.index}
                          onSelect={() => selectOption(option)}
                          onHover={() => setActiveIndex(option.index)}
                        />
                      ))}
                  </ul>
                </Group>
              )}

              {collections.length > 0 && (
                <Group label="Collections">
                  <ul>
                    {flat
                      .filter((o): o is Extract<FlatOption, { kind: "collection" }> => o.kind === "collection")
                      .map((option) => (
                        <SimpleRow
                          key={`col-${option.data.slug}`}
                          id={optId(option.index)}
                          label={option.data.name}
                          subtitle={option.data.shortDescription}
                          icon="collection"
                          active={activeIndex === option.index}
                          onSelect={() => selectOption(option)}
                          onHover={() => setActiveIndex(option.index)}
                        />
                      ))}
                  </ul>
                </Group>
              )}

              {guides.length > 0 && (
                <Group label="Guides">
                  <ul>
                    {flat
                      .filter((o): o is Extract<FlatOption, { kind: "guide" }> => o.kind === "guide")
                      .map((option) => (
                        <SimpleRow
                          key={`guide-${option.data.slug}`}
                          id={optId(option.index)}
                          label={option.data.title}
                          subtitle={option.data.platform || option.data.summary}
                          icon="guide"
                          active={activeIndex === option.index}
                          onSelect={() => selectOption(option)}
                          onHover={() => setActiveIndex(option.index)}
                        />
                      ))}
                  </ul>
                </Group>
              )}

              {flat.some((o) => o.kind === "viewall") && (
                <button
                  type="button"
                  id={optId(flat[flat.length - 1].index)}
                  role="option"
                  aria-selected={activeIndex === flat[flat.length - 1].index}
                  onMouseEnter={() => setActiveIndex(flat[flat.length - 1].index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={goToSearch}
                  className={`flex w-full items-center justify-between gap-2 border-t border-border px-4 py-3 text-left text-sm font-medium transition ${
                    activeIndex === flat[flat.length - 1].index
                      ? "bg-surface text-white"
                      : "text-accent hover:bg-surface"
                  }`}
                >
                  <span>
                    Voir tous les résultats pour{" "}
                    <span className="text-white">« {trimmed} »</span>
                  </span>
                  <span aria-hidden>{"→"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5">
      <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

function ProductRow({
  id,
  result,
  active,
  onSelect,
  onHover,
}: {
  id: string;
  result: ProductSearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const region = getRegion(result.region);
  return (
    <li role="option" aria-selected={active} id={id}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
          active ? "bg-surface" : "hover:bg-surface"
        }`}
      >
        <SearchThumb category={result.category} imageUrl={result.imageUrl} label={result.name} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium text-text">{result.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
            <span className="truncate">{result.categoryName}</span>
            {region.kind !== "unknown" && (
              <>
                <span aria-hidden>{"·"}</span>
                <RegionBadge code={result.region} variant="chip" size="micro" />
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[11px] leading-none text-faint">{"À partir de"}</span>
          <span className="mt-1 block font-mono text-sm font-semibold text-text">
            {formatDH(result.price)}
          </span>
        </span>
      </button>
    </li>
  );
}

function SimpleRow({
  id,
  label,
  subtitle,
  icon,
  active,
  onSelect,
  onHover,
}: {
  id: string;
  label: string;
  subtitle?: string;
  icon: "category" | "collection" | "guide";
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <li role="option" aria-selected={active} id={id}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
          active ? "bg-surface" : "hover:bg-surface"
        }`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface2 text-faint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
            {icon === "category" ? (
              <>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </>
            ) : icon === "guide" ? (
              <>
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
                <line x1="8" y1="7.5" x2="16" y2="7.5" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </>
            )}
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{label}</span>
          {subtitle ? (
            <span className="block truncate text-xs text-muted">{subtitle}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function EmptyState({ query, onCatalogue }: { query: string; onCatalogue: () => void }) {
  return (
    <div className="px-4 py-5 text-center">
      <p className="text-sm text-muted">
        Aucun résultat pour{" "}
        <span className="font-medium text-white">« {query} »</span>
      </p>
      <p className="mt-2 text-xs text-faint">
        Essayez le nom de la plateforme, du produit ou de la région.
      </p>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onCatalogue}
        className="mt-3 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        Voir tout le catalogue
      </button>
    </div>
  );
}

/**
 * Compact 44px product thumbnail for a result row. Purpose-built (rather than
 * reusing the large-format `ProductArt`) because that component's
 * `object-contain max-*-full` image collapses to 0×0 in a tiny box and then
 * never triggers its own lazy load. Here the image fills an explicitly-sized
 * box and falls back to the branded category code on error / when absent.
 */
function SearchThumb({
  category,
  imageUrl,
  label,
}: {
  category: string;
  imageUrl?: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  const code = category.split(" ")[0]?.toUpperCase() ?? "";
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-[#09090b]">
      {showImage ? (
        <img
          src={imageUrl ?? ""}
          alt={label}
          className="h-full w-full object-cover"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#697082]">{code}</span>
      )}
    </span>
  );
}

function SkeletonRows() {
  return (
    <ul className="p-1.5" aria-hidden>
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 px-2.5 py-2">
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-surface2" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3.5 w-1/2 animate-pulse rounded bg-surface2" />
            <span className="h-3 w-1/3 animate-pulse rounded bg-surface2" />
          </span>
          <span className="h-6 w-16 shrink-0 animate-pulse rounded bg-surface2" />
        </li>
      ))}
    </ul>
  );
}
