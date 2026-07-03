"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isMetaPixelEnabled, trackMetaEvent } from "@/lib/meta/client";

/**
 * Boots the Meta Pixel and fires a deduplicated PageView (pixel + CAPI) on
 * every route change, including SPA navigations. Render inside <Suspense>
 * because of useSearchParams.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!isMetaPixelEnabled()) return;
    trackMetaEvent("PageView");
  }, [pathname, search]);

  return null;
}
