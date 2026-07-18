"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * "Copier le lien officiel" — copies the platform's official activation URL.
 * Per the design the label swaps to "Copié !" for 1.5s, then reverts.
 * Rendered only when the guide actually has an official URL authored.
 */
export default function GuideCopyLink({ url, slug }: { url: string; slug: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackEvent("guide_copy_official_link", { guide: slug });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing else we can safely do */
    }
  }

  return (
    <>
      <button type="button" onClick={onCopy} className="btn-ghost inline-flex items-center gap-2">
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
        <span>{copied ? "Copié !" : "Copier le lien officiel"}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Lien officiel copié." : ""}
      </span>
    </>
  );
}
