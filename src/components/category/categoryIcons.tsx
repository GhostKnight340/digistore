import type { ReactNode } from "react";
import type { InfoIconKey } from "@/lib/categoryLanding";

// Shared inline-SVG icon set for category quick-info items. Mirrors the
// TrustStrip icon convention (24x24, stroke=currentColor). Only these approved
// keys are renderable — the admin picks from them, so no arbitrary SVG/HTML is
// ever injected. Keep keys in sync with APPROVED_INFO_ICONS in categoryLanding.
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true as const,
};

const ICONS: Record<InfoIconKey, ReactNode> = {
  bolt: (
    <svg {...iconProps}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  shield: (
    <svg {...iconProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  globe: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  ),
  support: (
    <svg {...iconProps}>
      <path d="M4 18v-6a8 8 0 0 1 16 0v6" />
      <path d="M20 18a2 2 0 0 1-2 2h-1v-5h3zM4 18a2 2 0 0 0 2 2h1v-5H4z" />
    </svg>
  ),
  lock: (
    <svg {...iconProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  check: (
    <svg {...iconProps}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  card: (
    <svg {...iconProps}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  ),
  sparkle: (
    <svg {...iconProps}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
  ),
};

export function CategoryInfoIcon({ name }: { name: InfoIconKey }) {
  return ICONS[name] ?? ICONS.bolt;
}
