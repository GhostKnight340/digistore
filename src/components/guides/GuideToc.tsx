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
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
          Sur cette page
        </p>
        <ul className="space-y-1 border-l border-border">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => onJump(e, item.id)}
                  aria-current={active ? "location" : undefined}
                  className={`-ml-px block border-l-2 py-1 pl-4 text-[13px] leading-snug transition ${
                    active
                      ? "border-accent font-medium text-white"
                      : "border-transparent text-muted hover:border-border-strong hover:text-white"
                  }`}
                >
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
