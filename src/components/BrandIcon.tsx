import type { CategoryId } from "@/lib/types";

/**
 * Monochrome, brand-style category glyphs. Drawn with `currentColor` so they
 * inherit text color, and sized via `className` (set width/height utilities).
 * These are simplified, original silhouettes — not official logos.
 */
export default function BrandIcon({
  category,
  className = "h-6 w-6",
}: {
  category: CategoryId;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    "aria-hidden": true as const,
  };

  switch (category) {
    case "steam":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="16" cy="8" r="3.1" />
          <circle cx="8.4" cy="14.2" r="2.9" />
          <line x1="13.6" y1="9.4" x2="10.6" y2="12.6" />
          <circle cx="16" cy="8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );

    case "playstation":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.6}>
          {/* triangle */}
          <path d="M12 3.2l2.4 4.2H9.6z" />
          {/* circle */}
          <circle cx="12" cy="18" r="2.4" />
          {/* cross */}
          <path d="M3.4 9.6l3.4 3.4M6.8 9.6l-3.4 3.4" strokeLinecap="round" />
          {/* square */}
          <rect x="15.6" y="9.4" width="4.6" height="4.6" rx="0.7" />
        </svg>
      );

    case "xbox":
      return (
        <svg
          {...common}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M7 5.8c3 2.3 7.2 6.5 10 12.2" />
          <path d="M17 5.8c-3 2.3-7.2 6.5-10 12.2" />
        </svg>
      );

    case "nintendo":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.7}>
          <rect x="4" y="4.5" width="16" height="15" rx="3.2" />
          <line x1="12" y1="4.5" x2="12" y2="19.5" />
          <circle cx="8" cy="9" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="14.6" r="1.4" />
        </svg>
      );

    case "roblox":
      return (
        <svg {...common} fill="currentColor">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            transform="rotate(11 12 12)"
            d="M4.6 4.6h14.8v14.8H4.6V4.6Zm5.3 5.3v3.9h3.9V9.9H9.9Z"
          />
        </svg>
      );

    case "valorant":
      return (
        <svg {...common} fill="currentColor">
          <path d="M3.5 5h3.3l5.2 10.2L17.2 5h3.3l-7.3 14.5h-2.4L3.5 5Z" />
        </svg>
      );

    default:
      return null;
  }
}
