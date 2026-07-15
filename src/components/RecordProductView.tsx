"use client";

import { useEffect } from "react";
import { recordView } from "@/lib/recentlyViewed";

/**
 * Records a product view in the local "Consultés récemment" history. Rendered on
 * the product page (which only ever renders an ACTIVE, visible parent product),
 * so we only ever store slugs the storefront currently serves. Renders nothing.
 */
export default function RecordProductView({
  slug,
  max,
}: {
  slug: string;
  max?: number;
}) {
  useEffect(() => {
    recordView(slug, max);
  }, [slug, max]);
  return null;
}
