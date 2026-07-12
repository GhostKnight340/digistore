"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal scroll-snap carousel for the featured products. Each child is a
 * pre-rendered ProductCard (passed from the server component). Shows pagination
 * dots and auto-advances one page at a time; auto-advance is disabled when the
 * user prefers reduced motion or is interacting, and pauses on hover.
 *
 * Sizing: peek the next card on mobile, ~2 up on small, 4 up on large — the
 * snap points are per-card so dots map to "pages" of the visible width.
 */
export default function FeaturedCarousel({
  children,
  autoAdvanceMs = 4500,
}: {
  children: React.ReactNode[];
  autoAdvanceMs?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = children.length;

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const perView = Math.max(1, Math.round(el.clientWidth / cardWidth(el)));
    setPages(Math.max(1, Math.ceil(count / perView)));
    setActive(pageFromScroll(el));
  }, [count]);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => setActive(pageFromScroll(el));
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useEffect(() => {
    if (pages <= 1 || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (pageFromScroll(el) + 1) % pages;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [pages, paused, autoAdvanceMs]);

  function goTo(page: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: page * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={scrollerRef}
        className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, i) => (
          <div
            key={i}
            className="w-[78%] shrink-0 snap-start min-[430px]:w-[46%] sm:w-[31%] lg:w-[23.5%]"
          >
            {child}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Aller à la page ${i + 1}`}
              aria-current={active === i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                active === i ? "w-6 bg-accent" : "w-1.5 bg-border-strong hover:bg-muted"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Width of one snap card including the gap, read from the first item. */
function cardWidth(el: HTMLElement): number {
  const first = el.firstElementChild as HTMLElement | null;
  if (!first) return el.clientWidth;
  const gap = parseFloat(getComputedStyle(el).columnGap || "20") || 20;
  return first.getBoundingClientRect().width + gap;
}

function pageFromScroll(el: HTMLElement): number {
  if (el.clientWidth === 0) return 0;
  return Math.round(el.scrollLeft / el.clientWidth);
}
