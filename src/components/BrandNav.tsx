import Link from "next/link";
import type { ReactNode } from "react";
import type { Category } from "@/lib/types";
import {
  BRAND_LOGO_SRC,
  canonicalBrandKey,
  resolveBrandColor,
} from "@/lib/brandAssets";
import { categoryHref } from "@/lib/categoryUrl";

/**
 * The brand quick-nav renders official logos from `public/marques/` (see
 * `BRAND_LOGO_SRC`). Resolution order per tile: an admin-uploaded `iconUrl`
 * wins, then the bundled logo, then a hand-drawn inline mark for brands without
 * a supplied asset, then the emoji `icon` — so brand media stays fully
 * controllable from Admin → Catégories.
 */

/** Hand-drawn fallback marks for brands with no supplied logo asset. Tinted by
 * the tile accent via `currentColor`. */
const BRAND_LOGOS: Record<string, ReactNode> = {
  nintendo: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M9 3H6.5A3.5 3.5 0 0 0 3 6.5v11A3.5 3.5 0 0 0 6.5 21H9V3zm-2 13.2A1.7 1.7 0 1 1 8.7 14.5 1.7 1.7 0 0 1 7 16.2zM17.5 3H15v18h2.5A3.5 3.5 0 0 0 21 17.5v-11A3.5 3.5 0 0 0 17.5 3z" />
    </svg>
  ),
  roblox: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
      <path d="M5.6 2 2 16.4 18.4 22 22 7.6 5.6 2zm7.9 12L9 12.9l1-4.4L14.5 9.6 13.5 14z" />
    </svg>
  ),
};

function BrandTile({ category }: { category: Category }) {
  const accent = resolveBrandColor(category.slug ?? category.id, category.accentColor);
  const key = canonicalBrandKey(category.slug ?? category.id);
  const logoSrc = category.iconUrl ?? BRAND_LOGO_SRC[key] ?? null;
  const inlineLogo = BRAND_LOGOS[key] ?? null;

  return (
    <Link
      href={categoryHref(category)}
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
        className="relative grid h-11 w-11 place-items-center"
        style={{ color: accent }}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            className="h-8 w-auto max-w-[44px] object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : inlineLogo ? (
          <span className="h-8 w-8">{inlineLogo}</span>
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
