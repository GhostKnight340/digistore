"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the returned ref's element first scrolls into view, and
 * invokes the (optional) callback exactly once. Used for accurate
 * "section viewed" analytics without turning whole sections into eager work.
 *
 * Falls back to firing immediately when IntersectionObserver is unavailable
 * (old browsers, SSR hydration edge cases) so the event is never lost.
 */
export function useInViewOnce<T extends HTMLElement = HTMLElement>(
  onView?: () => void,
): { ref: React.RefObject<T | null>; seen: boolean } {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const node = ref.current;
    const fire = () => {
      if (fired.current) return;
      fired.current = true;
      setSeen(true);
      onView?.();
    };

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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, seen };
}
