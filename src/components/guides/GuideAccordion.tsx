"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Accordion used for both "Dépannage" and "FAQ" on the guide article.
 * Per the design: independent open/close state per item, first item open by
 * default, chevron rotates 180° when open.
 */
export default function GuideAccordion({
  items,
  slug,
  event,
}: {
  items: { id: string; question: string; answer: string }[];
  slug: string;
  /** Analytics event name, e.g. "guide_troubleshooting_open". */
  event: string;
}) {
  // First item open by default (design spec).
  const [open, setOpen] = useState<Set<string>>(() =>
    items.length > 0 ? new Set([items[0].id]) : new Set(),
  );

  if (items.length === 0) return null;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        trackEvent(event, { guide: slug });
      }
      return next;
    });
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isOpen = open.has(item.id);
        return (
          <li key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface"
            >
              <span className="text-[14.5px] font-medium text-white">{item.question}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0 text-faint transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {isOpen && (
              <div className="border-t border-border px-4 py-3.5">
                <p className="text-[14px] leading-relaxed text-muted">{item.answer}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
