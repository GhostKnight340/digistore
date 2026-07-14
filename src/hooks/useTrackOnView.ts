"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires a single PII-free analytics event the first time the referenced element
 * scrolls into view. Uses IntersectionObserver (no polling); degrades to firing
 * on mount when the API is unavailable, and never throws. Attach the returned
 * ref to the section you want to measure.
 */
export function useTrackOnView<T extends HTMLElement = HTMLElement>(
  event: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const ref = useRef<T | null>(null);
  const fired = useRef(false);
  // Keep the latest params without re-subscribing the observer.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (fired.current) return;
    const node = ref.current;
    const send = () => {
      if (fired.current) return;
      fired.current = true;
      trackEvent(event, paramsRef.current);
    };

    if (!node || typeof IntersectionObserver === "undefined") {
      send();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            send();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return ref;
}
