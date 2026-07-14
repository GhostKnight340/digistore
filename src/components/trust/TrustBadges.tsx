import type { TrustItemSetting } from "@/lib/storeSettings";

/**
 * Reusable, restrained trust strip: a single row of ✓ guarantees. Distinct from
 * the four-card `TrustStrip` ("Pourquoi nous choisir") — this is the compact
 * inline strip meant to be dropped on the homepage, product pages, cart and
 * checkout. Reads the existing admin-managed `trustItems` (no new config) so it
 * stays in sync everywhere it appears.
 */
export default function TrustBadges({
  items,
  className = "",
}: {
  items: TrustItemSetting[];
  className?: string;
}) {
  const visible = items.filter((item) => item.enabled && item.title.trim());
  if (visible.length === 0) return null;

  return (
    <ul
      className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 rounded-[14px] border border-border bg-surface/60 px-5 py-3.5 ${className}`}
    >
      {visible.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2 text-[13px] font-medium text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5BC98C"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{item.title}</span>
        </li>
      ))}
    </ul>
  );
}
