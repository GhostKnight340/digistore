"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatDH } from "@/lib/format";
import { toAnalyticsItem, trackEcommerce } from "@/lib/analytics";
import ProductArt from "./ProductArt";
import RegionBadge, { regionTitleSuffix } from "./RegionBadge";
import WishlistButton from "./WishlistButton";

export default function ProductCard({
  product,
  featured = false,
  accent,
  showWishlist = true,
  listName,
  index,
}: {
  product: Product;
  featured?: boolean;
  /** Brand accent color for the art glow and hover border. */
  accent?: string | null;
  /** Render the wishlist heart overlay (default on). */
  showWishlist?: boolean;
  /** GA4 list this card belongs to — enables `select_item` on click. */
  listName?: string;
  /** 0-based position within that list. */
  index?: number;
}) {
  const suffix = regionTitleSuffix(product.region);
  const brand = accent || "#3e7bfa";
  // `stockStatus` is derived server-side from the single availability rule
  // (lib/search/stock.ts → isVariantAvailable), the same one checkout applies.
  const outOfStock = product.stockStatus === "out_of_stock";
  return (
    // The heart is a SIBLING of the card Link (never a button nested in an
    // anchor), overlaid on the media so the whole card stays one tap target.
    <div className="group relative min-w-0">
      {showWishlist && (
        <WishlistButton slug={product.id} className="absolute right-2.5 top-2.5 z-10" />
      )}
      <Link
        href={product.href ?? `/products/${product.id}`}
        onClick={
          listName
            ? () =>
                trackEcommerce("select_item", {
                  item_list_name: listName,
                  items: [
                    toAnalyticsItem(
                      {
                        id: product.id,
                        name: product.name,
                        category: product.categoryName,
                        price: product.price,
                      },
                      { index, item_list_name: listName },
                    ),
                  ],
                })
            : undefined
        }
        style={{ ["--brand" as string]: brand }}
        className={`flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-surface transition duration-200 ${
          featured
            ? "border-border-strong shadow-soft hover:-translate-y-1 hover:border-[var(--brand)] hover:shadow-[0_22px_54px_rgba(0,0,0,0.38)]"
            : "border-border hover:-translate-y-[3px] hover:border-[var(--brand)] hover:shadow-soft"
        }`}
      >
      <div className="relative shrink-0">
        <ProductArt
          category={product.category}
          imageUrl={product.imageUrl}
          label={product.name}
          accent={brand}
          className={`w-full rounded-t-[14px] transition duration-200 group-hover:scale-[1.015] ${
            featured ? "aspect-[1.45]" : "aspect-[16/9]"
          }`}
        />
        <RegionBadge code={product.region} variant="overlay" className="absolute left-2.5 top-2.5" />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${featured ? "p-5" : "p-4"}`}>
        {outOfStock ? (
          <span className="mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#F7B14A]/25 bg-[#F7B14A]/[0.07] px-2.5 py-1 text-[11px] font-medium text-[#D9B27C]">
            Rupture de stock
          </span>
        ) : (
        <span className="mb-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="h-2.5 w-2.5"
            aria-hidden
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Livraison rapide
        </span>
        )}
        {/* Reserve two lines so cards with a short name stay the same height as
            cards whose name wraps (e.g. "App Store & iTunes France 5 EUR"). */}
        <h3 className={`line-clamp-2 font-medium leading-snug text-text ${featured ? "min-h-[2.625rem] text-[15px]" : "min-h-[2.5rem] text-[14.5px]"}`}>
          {product.name}
          {suffix.label && <> <span className={suffix.className}>{suffix.label}</span></>}
        </h3>
        <div className={`${featured ? "mt-4" : "mt-3"} flex flex-wrap items-baseline justify-between gap-2`}>
          <span className={`font-mono font-semibold tracking-tight text-text ${featured ? "text-xl" : "text-lg"}`}>
            {formatDH(product.price)}
          </span>
          <span className="min-w-0 truncate text-xs text-faint">{product.categoryName}</span>
        </div>
      </div>
      </Link>
    </div>
  );
}
