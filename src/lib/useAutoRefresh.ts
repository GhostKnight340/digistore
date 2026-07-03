"use client";

import { useEffect, useRef } from "react";

/**
 * Periodically invokes `callback` so high-change admin panels (orders, payment
 * review, fulfillment, inventory) update without a manual refresh. Polling only
 * fires while the tab is visible, and fires once immediately when the tab
 * regains focus, to avoid wasted work in the background.
 */
export function useAutoRefresh(
  callback: () => void,
  intervalMs = 20000,
  enabled = true,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        callbackRef.current();
      }
    };

    const timer = setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") callbackRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
