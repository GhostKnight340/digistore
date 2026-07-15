"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { useWishlist } from "@/context/WishlistContext";

type FavItem = { product: Product; savedAt: string };

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Wishlist grid that reflects live removals: when the heart on a card is
 * toggled off, the card disappears immediately (the WishlistContext is the
 * source of truth) without a full page reload. Falls back to the empty state
 * once everything is removed.
 */
export default function FavorisGrid({ items }: { items: FavItem[] }) {
  const { isSaved, ready } = useWishlist();
  // Before hydration, show everything the server rendered; after, filter to the
  // still-saved set so removals vanish instantly.
  const visible = ready ? items.filter((it) => isSaved(it.product.id)) : items;

  if (visible.length === 0) {
    return <EmptyFavoris />;
  }

  return (
    <div className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 lg:grid-cols-3">
      {visible.map(({ product, savedAt }) => (
        <div key={product.id} className="flex flex-col gap-1.5">
          <ProductCard product={product} />
          <p className="px-1 text-[11px] text-faint">
            Enregistré le {DATE_FMT.format(new Date(savedAt))}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyFavoris() {
  return (
    <div className="flex flex-col items-center px-2 py-10 text-center sm:px-6">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7" aria-hidden>
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l1.7 1.7L12 21.5l7.1-7.1 1.7-1.7a5 5 0 0 0 0-7.1z" />
        </svg>
      </span>
      <p className="mt-4 text-[15px] font-semibold text-white">Aucun produit enregistré.</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        Enregistrez vos produits favoris avec le cœur pour les retrouver ici.
      </p>
      <Link href="/products" className="btn-primary mt-5 text-sm">
        Parcourir le catalogue
      </Link>
    </div>
  );
}
