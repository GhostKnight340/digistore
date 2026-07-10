"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ProductSearchResult } from "@/lib/types";
import { formatDH } from "@/lib/format";
import { getRegion } from "@/lib/regions";
import RegionBadge from "./RegionBadge";

type Variant = "desktop" | "mobile";

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

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

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const ready = trimmed.length >= MIN_QUERY;
  const showDropdown = open && ready;
  // "Voir tous les résultats" is a real, selectable row when there are extra
  // matches beyond the preview; keyboard navigation can land on it.
  const showViewAll = hasMore && results.length > 0;
  const optionCount = results.length + (showViewAll ? 1 : 0);
  const viewAllIndex = showViewAll ? results.length : -1;

  const goToCatalogue = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/products?q=${encodeURIComponent(trimmed)}`);
  }, [router, trimmed]);

  const goToResult = useCallback(
    (result: ProductSearchResult) => {
      setOpen(false);
      inputRef.current?.blur();
      router.push(result.href);
    },
    [router],
  );

  // Debounced fetch. Aborts the in-flight request on each keystroke and ignores
  // stale responses so results always match the latest query.
  useEffect(() => {
    if (!ready) {
      setResults([]);
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
          results: ProductSearchResult[];
          hasMore: boolean;
        };
        setResults(data.results ?? []);
        setHasMore(Boolean(data.hasMore));
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setResults([]);
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
  }, [results, showViewAll]);

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
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showDropdown || optionCount === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = current + delta;
        if (next < 0) return optionCount - 1;
        if (next >= optionCount) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault();
        goToResult(results[activeIndex]);
      } else if (activeIndex === viewAllIndex && showViewAll) {
        event.preventDefault();
        goToCatalogue();
      } else if (ready) {
        event.preventDefault();
        goToCatalogue();
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

  return (
    <div ref={containerRef} className={wrapperClass}>
      <form
        role="search"
        className="relative flex h-full w-full items-center"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) goToCatalogue();
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
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
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
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-card"
        >
          {loading && results.length === 0 ? (
            <SkeletonRows />
          ) : results.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-muted">
                Aucun produit trouvé pour{" "}
                <span className="font-medium text-white">
                  « {trimmed} »
                </span>
              </p>
              <button
                type="button"
                onClick={goToCatalogue}
                className="mt-3 text-sm font-medium text-accent transition hover:text-accent-hover"
              >
                Voir tout le catalogue
              </button>
            </div>
          ) : (
            <>
              <ul className="p-1.5">
                {results.map((result, index) => (
                  <ResultRow
                    key={result.id}
                    id={`${listboxId}-opt-${index}`}
                    result={result}
                    active={activeIndex === index}
                    onSelect={() => goToResult(result)}
                    onHover={() => setActiveIndex(index)}
                  />
                ))}
              </ul>
              {showViewAll && (
                <button
                  type="button"
                  id={`${listboxId}-opt-${viewAllIndex}`}
                  role="option"
                  aria-selected={activeIndex === viewAllIndex}
                  onMouseEnter={() => setActiveIndex(viewAllIndex)}
                  onClick={goToCatalogue}
                  className={`flex w-full items-center justify-between gap-2 border-t border-border px-4 py-3 text-left text-sm font-medium transition ${
                    activeIndex === viewAllIndex
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
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
        // Keep focus in the input so keyboard nav and blur behave predictably.
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
          active ? "bg-surface" : "hover:bg-surface"
        }`}
      >
        <SearchThumb
          category={result.category}
          imageUrl={result.imageUrl}
          label={result.name}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium text-text">
            {result.name}
          </span>
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
          <span className="block text-[11px] leading-none text-faint">
            {"À partir de"}
          </span>
          <span className="mt-1 block font-mono text-sm font-semibold text-text">
            {formatDH(result.price)}
          </span>
        </span>
      </button>
    </li>
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
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#697082]">
          {code}
        </span>
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
