"use client";

import { useTrackOnView } from "@/hooks/useTrackOnView";
import { TRUST_BADGES, TRUST_EVENTS } from "@/lib/trust/content";

/**
 * Reusable trust strip — a compact row of ✓ reassurance points. Designed to be
 * dropped anywhere (homepage, product pages, campaign pages). Wraps cleanly on
 * small screens with no horizontal overflow. Fires one view event.
 */
export default function TrustBadges({
  className = "",
  variant = "strip",
}: {
  className?: string;
  /** "strip" = bordered card row; "bare" = inline chips with no container. */
  variant?: "strip" | "bare";
}) {
  const ref = useTrackOnView<HTMLDivElement>(TRUST_EVENTS.trustViewed);

  const list = (
    <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
      {TRUST_BADGES.map((badge) => (
        <li
          key={badge.id}
          className="flex items-center gap-2 text-[13px] font-medium text-muted"
        >
          <CheckIcon />
          <span>{badge.label}</span>
        </li>
      ))}
    </ul>
  );

  if (variant === "bare") {
    return (
      <div ref={ref} className={className}>
        {list}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`rounded-[16px] border border-border bg-surface/60 px-5 py-4 ${className}`}
    >
      {list}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5BC98C"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[15px] w-[15px] shrink-0"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
