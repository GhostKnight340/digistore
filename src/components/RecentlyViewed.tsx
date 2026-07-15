"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { getRecentSlugs, clearRecent } from "@/lib/recentlyViewed";

/**
 * "Consultés récemment" section. Reads parent slugs from localStorage, then asks
 * the server (`/api/recently-viewed`) for the still-visible cards in order — so
 * hidden/removed products never appear and prices are fresh. Renders nothing
 * (no empty placeholder) when there is no eligible history, so it can be dropped
 * into any page without reserving space. The clear action confirms first.
 */
export default function RecentlyViewed({
  excludeSlug,
  title = "Consultés récemment",
  limit = 12,
  className = "",
}: {
  /** Hide this slug (e.g. the product you're currently on). */
  excludeSlug?: string;
  title?: string;
  limit?: number;
  className?: string;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const slugs = getRecentSlugs()
      .filter((s) => s !== excludeSlug)
      .slice(0, limit);
    if (slugs.length === 0) {
      setProducts([]);
      return;
    }
    let active = true;
    const controller = new AbortController();
    fetch(`/api/recently-viewed?slugs=${encodeURIComponent(slugs.join(","))}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data: { products?: Product[] }) => {
        if (active) setProducts(data.products ?? []);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [excludeSlug, limit]);

  function onClear() {
    if (!confirm("Effacer votre historique de produits consultés ?")) return;
    clearRecent();
    setCleared(true);
  }

  // Nothing to show (no history, still loading, or just cleared).
  if (cleared || products === null || products.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading" className={className}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id="recently-viewed-heading"
          className="text-lg font-semibold tracking-tight text-white sm:text-xl"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-faint transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Effacer l&apos;historique
        </button>
      </div>
      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
