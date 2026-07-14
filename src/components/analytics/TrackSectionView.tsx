"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires a single analytics event the first time its anchor scrolls into view
 * (via IntersectionObserver), for section-visibility metrics like
 * "delivery_section_viewed" or "payment_methods_viewed". PII-free by design —
 * same guarantees as `trackEvent`. Renders an invisible, zero-height anchor so
 * it can be dropped inside any section without affecting layout.
 *
 * Falls back to firing on mount when IntersectionObserver is unavailable.
 */
export default function TrackSectionView({
  event,
  params,
}: {
  event: string;
  params?: Record<string, string | number | boolean | undefined>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const fire = () => {
      if (sent.current) return;
      sent.current = true;
      trackEvent(event, params ?? {});
    };

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span ref={ref} aria-hidden className="block h-0 w-0" />;
}
