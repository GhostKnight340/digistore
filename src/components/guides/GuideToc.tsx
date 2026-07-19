"use client";

import { useEffect, useRef, useState } from "react";
import type { TocItem } from "@/lib/guideMeta";
import { trackEvent } from "@/lib/analytics";

/**
 * "Sur cette page" — a table of contents built from the guide's heading blocks
 * (their stable ids are emitted as anchors by GuideContent). A single
 * IntersectionObserver highlights the section currently in view. Renders nothing
 * for short guides (< 2 headings) and is hidden on print. Stickiness and
 * breakpoint visibility come from the guide page's right rail.
 */
/**
 * Section glyphs for the structured guide sections. Legacy guides build their
 * TOC from arbitrary heading ids, so anything unrecognised falls back to a
 * neutral dot rather than a wrong icon.
 */
const TOC_ICON_PATHS: Record<string, React.ReactNode> = {
  "avant-de-commencer": <path d="M5 12.5l4.5 4.5L19 7" />,
  "les-etapes": (
    <>
      <path d="M4 19h4v-4H4z" />
      <path d="M10 15h4v-4h-4z" />
      <path d="M16 11h4V7h-4z" />
    </>
  ),
  depannage: <path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.1 2.1 0 0 1-3-3z" />,
  faq: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
};

function TocIcon({ id }: { id: string }) {
  const paths = TOC_ICON_PATHS[id];
  if (!paths) {
    return (
      <span aria-hidden className="guide-toc-icon h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="guide-toc-icon h-3.5 w-3.5 shrink-0 opacity-70"
      aria-hidden
    >
      {paths}
    </svg>
  );
}

export default function GuideToc({ items, slug }: { items: TocItem[]; slug: string }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const visible = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (items.length < 2) return;
    const order = items.map((i) => i.id);
    const elements = order
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.current.add(entry.target.id);
          else visible.current.delete(entry.target.id);
        }
        // Highlight the first heading (in document order) currently in view.
        const firstVisible = order.find((id) => visible.current.has(id));
        if (firstVisible) setActiveId(firstVisible);
      },
      { rootMargin: "-88px 0px -65% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  function onJump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
    trackEvent("guide_toc_click", { guide: slug });
  }

  return (
    <nav aria-label="Sur cette page" className="print:hidden">
      <div className="guide-accent-card rounded-2xl border bg-card p-4">
        <p className="mb-2.5 px-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
          Sur cette page
        </p>
        <ul className="space-y-0.5 border-l border-border">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => onJump(e, item.id)}
                  aria-current={active ? "location" : undefined}
                  className={`guide-toc-link -ml-px flex items-center gap-2.5 rounded-r-lg border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-snug transition ${
                    active
                      ? "font-medium text-white"
                      : "border-transparent text-muted hover:border-border-strong hover:text-white"
                  }`}
                >
                  <TocIcon id={item.id} />
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
