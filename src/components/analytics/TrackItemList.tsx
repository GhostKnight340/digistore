"use client";

import { useEffect, useRef } from "react";
import { toAnalyticsItem, trackEcommerce } from "@/lib/analytics";

/**
 * Fires a single GA4 `view_item_list` when mounted. Rendered from server
 * components (product grid, search results) that want the list impression
 * without becoming client components themselves. Renders nothing.
 *
 * Item shapes go through `toAnalyticsItem` — the same helper `select_item`,
 * `view_item` and the cart events use — because GA4 only joins funnel steps
 * when the item objects match. Catalog data only; never customer data.
 */
export default function TrackItemList({
  listName,
  products,
  limit = 20,
}: {
  listName: string;
  products: {
    id: string;
    name: string;
    categoryName?: string | null;
    price?: number | null;
  }[];
  /** GA4 caps an event's payload — only the first N impressions are sent. */
  limit?: number;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || products.length === 0) return;
    sent.current = true;
    trackEcommerce("view_item_list", {
      item_list_name: listName,
      items: products.slice(0, limit).map((product, index) =>
        toAnalyticsItem(
          {
            id: product.id,
            name: product.name,
            category: product.categoryName,
            price: product.price,
          },
          { index, item_list_name: listName },
        ),
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
