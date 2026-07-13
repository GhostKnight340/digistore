"use client";

import { useId, useRef, useState } from "react";
import type { CategoryFaqItem } from "@/lib/categoryLanding";
import { trackEvent } from "@/lib/analytics";

/**
 * Accessible category FAQ accordion. Each answer is ALWAYS rendered in the DOM
 * (collapsed via a CSS grid-rows transition, not conditional mounting) so the
 * answer text is present in the server-rendered HTML for SEO and structured
 * data. Buttons carry `aria-expanded`/`aria-controls`, are keyboard operable
 * with visible focus, and the open/close transition is disabled under
 * `prefers-reduced-motion`.
 *
 * Optional `analytics` fires one PII-free event the first time a given row is
 * expanded (only the FAQ item id is sent). Absent → no tracking, so every
 * existing caller is unaffected.
 */
export default function CategoryFaq({
  title,
  items,
  analytics,
}: {
  title?: string;
  items: CategoryFaqItem[];
  analytics?: { event: string; params?: Record<string, string | number | boolean | undefined> };
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-12 sm:mt-16">
      <h2 className="text-2xl font-semibold tracking-tight text-text">
        {title || "Questions fréquentes"}
      </h2>
      <div className="mt-6 divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-surface">
        {items.map((item) => (
          <FaqRow key={item.id} item={item} analytics={analytics} />
        ))}
      </div>
    </section>
  );
}

function FaqRow({
  item,
  analytics,
}: {
  item: CategoryFaqItem;
  analytics?: { event: string; params?: Record<string, string | number | boolean | undefined> };
}) {
  const [open, setOpen] = useState(false);
  const tracked = useRef(false);
  const base = useId();
  const buttonId = `${base}-q`;
  const panelId = `${base}-a`;

  const toggle = () => {
    setOpen((v) => {
      if (!v && analytics && !tracked.current) {
        tracked.current = true;
        trackEvent(analytics.event, { ...analytics.params, item_id: item.id });
      }
      return !v;
    });
  };

  return (
    <div>
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
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
          <p className="px-5 pb-4 text-[14px] leading-relaxed text-muted">
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}
