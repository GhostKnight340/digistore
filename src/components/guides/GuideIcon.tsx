import type { GuideIconKey } from "@/lib/guide";

/**
 * Inline SVG glyphs for the approved guide icon keys. Mirrors CollectionIcon /
 * categoryIcons: admins pick a KEY (never raw SVG), and we render a matching
 * stroke icon in the shared Ghost style. Falls back to the "book" glyph.
 */
export default function GuideIcon({
  icon,
  className = "h-5 w-5",
}: {
  icon: GuideIconKey | "" | string;
  className?: string;
}) {
  const key = (icon || "book") as GuideIconKey;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICONS[key] ?? ICONS.book}
    </svg>
  );
}

const ICONS: Record<GuideIconKey, React.ReactNode> = {
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <line x1="8" y1="7.5" x2="16" y2="7.5" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </>
  ),
  gaming: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="4" />
      <line x1="7" y1="11" x2="7" y2="13" />
      <line x1="6" y1="12" x2="8" y2="12" />
      <circle cx="16" cy="11" r="0.8" fill="currentColor" />
      <circle cx="18" cy="13" r="0.8" fill="currentColor" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18" />
      <path d="M12 9v12" />
      <path d="M12 9C10.5 5 6 5.5 7.5 8.2 8.6 9.4 12 9 12 9z" />
      <path d="M12 9c1.5-4 6-3.5 4.5-0.8C15.4 9.4 12 9 12 9z" />
    </>
  ),
  subscription: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v3.5h-3.5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
      <line x1="6" y1="14.5" x2="10" y2="14.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 4.9L19 9.5l-4.7 2.1L12 17l-2.3-5.4L5 9.5l5.2-1.6z" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a3 3 0 0 1 5.2 1.9c0 2-3 2.4-3 4" />
      <circle cx="11.4" cy="17" r="0.8" fill="currentColor" />
    </>
  ),
};
