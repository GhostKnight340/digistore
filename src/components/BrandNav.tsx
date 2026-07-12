import Link from "next/link";
import type { ReactNode } from "react";
import type { Category } from "@/lib/types";

/**
 * Bundled inline brand marks, keyed by normalized category id/slug. These keep the
 * quick-nav visually on-brand (like the competitor's platform strip) without adding
 * any `public/` assets or network fetches. `currentColor` is driven by each tile's
 * accent tint. Any category without a bundled mark falls back to its uploaded
 * `iconUrl`, then its emoji `icon`.
 */
const BRAND_LOGOS: Record<string, ReactNode> = {
  playstation: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M9.1 4.2v14.9l3 1V8.1c0-.7.3-1.1.8-1 .6.2.8.8.8 1.6v4.4c1.9.9 3.3-.1 3.3-2.6 0-2.6-.9-3.7-3.6-4.7-1.1-.4-2.9-1-4.3-1.6zM14.6 16.9l4.8-1.7c.6-.2.7-.5.2-.7-.5-.2-1.4-.2-2 0l-3 1.1v-1.7l.2-.1s.9-.3 2.1-.4c1.2-.1 2.7 0 3.9.5 1.3.5 1.5 1.2 1.2 1.7-.3.5-1.1.9-1.1.9l-6.5 2.3v-1.7zM4.3 16.6c-1.4-.4-1.6-1.2-1-1.7.6-.4 1.6-.8 1.6-.8l4.2-1.5v1.7l-3 1.1c-.5.2-.6.5-.1.7.5.2 1.3.2 1.9 0l1.2-.4v1.5l-.2.1c-1.5.5-3.1.4-4.6-.1z" />
    </svg>
  ),
  xbox: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M12 2a10 10 0 0 0-6.6 2.5c1.9-.7 4.9 1.3 6.6 3 1.7-1.7 4.7-3.7 6.6-3A10 10 0 0 0 12 2zM4 6.2A10 10 0 0 0 2 12c0 2.5.9 4.7 2.4 6.5-.7-2.4 2.9-7.3 5-9.6C6.9 6.6 5 5.6 4 6.2zm16 0c-1-.6-2.9.4-5.4 2.7 2.1 2.3 5.7 7.2 5 9.6A10 10 0 0 0 22 12a10 10 0 0 0-2-5.8zM12 10.5c-2.4 2.4-5.6 6.8-4.9 8.3A10 10 0 0 0 12 20a10 10 0 0 0 4.9-1.2c.7-1.5-2.5-5.9-4.9-8.3z" />
    </svg>
  ),
  nintendo: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M9 3H6.5A3.5 3.5 0 0 0 3 6.5v11A3.5 3.5 0 0 0 6.5 21H9V3zm-2 13.2A1.7 1.7 0 1 1 8.7 14.5 1.7 1.7 0 0 1 7 16.2zM17.5 3H15v18h2.5A3.5 3.5 0 0 0 21 17.5v-11A3.5 3.5 0 0 0 17.5 3z" />
    </svg>
  ),
  steam: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M12 2a10 10 0 0 0-9.9 8.6l5.3 2.2a2.8 2.8 0 0 1 1.6-.5h.1l2.4-3.4v-.1a3.7 3.7 0 1 1 3.7 3.7h-.1l-3.4 2.4v.1a2.8 2.8 0 0 1-5.6.2l-3.8-1.6A10 10 0 1 0 12 2zM8.4 17.3l-1.2-.5a2.1 2.1 0 0 0 3.9-1.1 2.1 2.1 0 0 0-2.9-1.9l1.3.5a1.55 1.55 0 1 1-1.1 2.9zm7.2-6.5a2.45 2.45 0 1 0-2.45-2.45 2.45 2.45 0 0 0 2.45 2.45zm0-3.9a1.45 1.45 0 1 1-1.45 1.45A1.45 1.45 0 0 1 15.6 6.9z" />
    </svg>
  ),
  roblox: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M5.6 2 2 16.4 18.4 22 22 7.6 5.6 2zm7.9 12L9 12.9l1-4.4L14.5 9.6 13.5 14z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M16.4 12.7c0-2.2 1.8-3.3 1.9-3.3a4 4 0 0 0-3.2-1.7c-1.3-.1-2.7.8-3.3.8s-1.7-.8-2.8-.8A4.3 4.3 0 0 0 5.3 10c-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.7 2.3s1.5-.7 2.8-.7 1.7.7 2.8.7 1.9-1.1 2.6-2.2a9 9 0 0 0 1.2-2.4 3.8 3.8 0 0 1-2.1-3.3zM14.3 6a3.7 3.7 0 0 0 .9-2.7 3.8 3.8 0 0 0-2.5 1.3 3.5 3.5 0 0 0-.9 2.6A3.1 3.1 0 0 0 14.3 6z" />
    </svg>
  ),
};

// Common aliases → canonical bundled-logo key.
const LOGO_ALIASES: Record<string, string> = {
  psn: "playstation",
  "playstation-store": "playstation",
  "playstation-plus": "playstation",
  "ps-plus": "playstation",
  "xbox-game-pass": "xbox",
  "steam-wallet": "steam",
  itunes: "apple",
  "app-store": "apple",
};

function brandLogo(category: Category): ReactNode | null {
  const key = (category.slug ?? category.id).toLowerCase();
  return BRAND_LOGOS[key] ?? BRAND_LOGOS[LOGO_ALIASES[key] ?? ""] ?? null;
}

function BrandTile({ category }: { category: Category }) {
  const accent = category.accentColor || "#3e7bfa";
  const logo = brandLogo(category);

  return (
    <Link
      href={`/products?category=${category.id}`}
      style={{ ["--brand" as string]: accent }}
      className="group relative flex min-w-[104px] shrink-0 snap-start flex-col items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-5 text-center transition duration-200 hover:-translate-y-[3px] hover:border-[var(--brand)] hover:shadow-soft sm:min-w-0"
    >
      {/* Accent wash — invisible at rest, blooms in the brand color on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[16px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(120px 90px at 50% 12%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%)",
        }}
      />
      <span
        className="relative grid h-11 w-11 place-items-center text-[color:var(--brand)]"
        style={{ color: accent }}
      >
        {logo ? (
          <span className="h-8 w-8">{logo}</span>
        ) : category.iconUrl ? (
          <img
            src={category.iconUrl}
            alt=""
            className="h-8 w-8 object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="text-2xl leading-none">{category.icon || "🎮"}</span>
        )}
      </span>
      <span className="relative text-[13px] font-medium leading-tight text-text">
        {category.name}
      </span>
    </Link>
  );
}

/**
 * Horizontal quick-nav strip of brand tiles derived from catalogue categories.
 * Scrolls horizontally on small screens; settles into an even grid from `sm` up.
 */
export default function BrandNav({
  categories,
  limit = 8,
}: {
  categories: Category[];
  limit?: number;
}) {
  const items = categories.filter((c) => c.active !== false).slice(0, limit);
  if (items.length === 0) return null;

  return (
    <div className="-mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
      {items.map((category) => (
        <BrandTile key={category.id} category={category} />
      ))}
    </div>
  );
}
