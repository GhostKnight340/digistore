"use client";

import { useEffect, useState } from "react";

/** Matches the admin shell's mobile breakpoint (see AdminShell.tsx / admin CSS). */
export const ADMIN_MOBILE_BREAKPOINT = 860;

/**
 * SSR-safe viewport-width hook. Starts `false` so desktop markup matches the
 * server render, then syncs to the real viewport after mount.
 */
export function useIsMobile(breakpoint: number = ADMIN_MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
