"use client";

import { useStoreSettings } from "@/context/StoreSettingsContext";

/**
 * Reusable "trust strip": a restrained row of ✓ items (Official products,
 * Secure payments, Local support…). Content comes from the trust CMS
 * (`settings.trust.trustStrip`) so admin can edit it later. Drop it anywhere —
 * homepage, product page, checkout, campaign pages — for a consistent trust cue.
 *
 * Renders as a flex-wrap row (no horizontal scroll at any width). Decorative
 * checkmarks are aria-hidden; the list is a real <ul> for screen readers.
 */
export default function TrustBadges({
  className = "",
}: {
  className?: string;
}) {
  const { settings } = useStoreSettings();
  const items = settings.trust.trustStrip;
  if (items.length === 0) return null;

  return (
    <ul
      className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 ${className}`}
    >
      {items.map((item) => (
        <li
          key={item}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5BC98C"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}
