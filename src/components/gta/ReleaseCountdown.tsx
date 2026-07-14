"use client";

import { useEffect, useState } from "react";
import { gtaReleaseDate } from "@/lib/gtaPreorder";

/**
 * Small, restrained pre-order countdown to the official 19 Nov 2026 release,
 * anchored to the fixed release instant (Ghost.ma business timezone) so it is
 * identical for every visitor. It is deliberately NOT the main visual focus:
 * one compact row of day/hour/minute/second cells.
 *
 * Accessibility: the ticking cells are `aria-hidden`; a single human-readable
 * sentence in a polite live region conveys the same information to assistive
 * tech without announcing every second. After release the whole block returns
 * null (graceful removal).
 *
 * SSR: the parent renders an accessible static "Sortie dans N jours" fallback
 * so the core content exists server-side; this component enhances it on the
 * client with the live ticker.
 */

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function computeRemaining(target: number, now: number): Remaining | null {
  const diff = target - now;
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

const CELLS: { key: keyof Remaining; label: string }[] = [
  { key: "days", label: "Jours" },
  { key: "hours", label: "Heures" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Secondes" },
];

export default function ReleaseCountdown() {
  const target = gtaReleaseDate().getTime();
  // Start null so server and first client render agree (no hydration mismatch);
  // the effect fills it in immediately on the client.
  const [remaining, setRemaining] = useState<Remaining | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tick = () => setRemaining(computeRemaining(target, Date.now()));
    tick();
    setReady(true);
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  // Before hydration, or after release, render nothing here — the server-side
  // static fallback (rendered by the parent) covers the pre-hydration case.
  if (!ready || !remaining) return null;

  const sentence = `Sortie dans ${remaining.days} jour${
    remaining.days === 1 ? "" : "s"
  }, ${remaining.hours} h et ${remaining.minutes} min.`;

  return (
    <div className="mt-6">
      <p className="sr-only" aria-live="polite">
        {sentence}
      </p>
      <ul aria-hidden className="grid max-w-md grid-cols-4 gap-2 sm:gap-3">
        {CELLS.map((cell) => (
          <li
            key={cell.key}
            className="flex flex-col items-center rounded-[14px] border px-2 py-3 sm:px-4"
            style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}
          >
            <span className="text-[26px] font-extrabold leading-none tabular-nums text-white sm:text-[32px]">
              {String(remaining[cell.key]).padStart(2, "0")}
            </span>
            <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#a99fc4] sm:text-[10px] sm:tracking-[0.14em]">
              {cell.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
