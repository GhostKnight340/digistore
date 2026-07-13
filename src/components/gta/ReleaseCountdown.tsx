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
    <div className="mt-4">
      <p className="sr-only" aria-live="polite">
        {sentence}
      </p>
      <ul aria-hidden className="flex flex-wrap gap-2">
        {CELLS.map((cell) => (
          <li
            key={cell.key}
            className="flex min-w-[58px] flex-col items-center rounded-[12px] border border-border bg-surface2/70 px-3 py-2"
          >
            <span className="font-mono text-xl font-semibold tabular-nums text-white">
              {String(remaining[cell.key]).padStart(2, "0")}
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-faint">
              {cell.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
