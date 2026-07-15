"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Share action. Uses the Web Share API where supported (native sheet on mobile);
 * otherwise copies the canonical URL to the clipboard and announces "Lien copié."
 *
 * The caller supplies a clean, customer-facing payload — a relative or absolute
 * canonical URL, a page title, and a short description. Internal ids, tracking
 * secrets, admin/preview URLs are never added here: whatever `url` is passed is
 * resolved against the current origin and shared as-is. Public attribution
 * params, if any, must already be part of `url`.
 *
 * Accessibility: a real <button> with an accessible label, visible focus ring,
 * and a polite live region announcing the copied state.
 */
export default function ShareButton({
  url,
  title,
  text,
  label = "Partager",
  variant = "button",
  className = "",
}: {
  url: string;
  title: string;
  text?: string;
  label?: string;
  variant?: "button" | "icon";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function resolveUrl(): string {
    if (typeof window === "undefined") return url;
    try {
      // Resolves a relative path against the current origin; leaves absolute
      // URLs untouched. Guards against malformed input.
      return new URL(url, window.location.origin).toString();
    } catch {
      return window.location.href;
    }
  }

  async function onShare() {
    const shareUrl = resolveUrl();
    trackEvent("share", { method: "click", content_title: title });
    // Prefer the native share sheet (mobile / supported browsers).
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: shareUrl });
        trackEvent("share", { method: "web_share", content_title: title });
        return;
      } catch (error) {
        // AbortError = user dismissed the sheet; fall through to copy only for
        // genuine failures (e.g. NotAllowedError), not user cancellation.
        if ((error as Error).name === "AbortError") return;
      }
    }
    // Fallback: copy the canonical URL.
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackEvent("share", { method: "copy", content_title: title });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing else we can safely do */
    }
  }

  const shareIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.7" x2="15.4" y2="6.3" />
      <line x1="8.6" y1="13.3" x2="15.4" y2="17.7" />
    </svg>
  );

  const checkIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={onShare}
          aria-label={copied ? "Lien copié" : label}
          className={`grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted transition hover:border-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${className}`}
        >
          {copied ? checkIcon : shareIcon}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Lien copié." : ""}
        </span>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onShare}
        className={`btn-ghost inline-flex items-center gap-2 ${className}`}
      >
        {copied ? checkIcon : shareIcon}
        <span>{copied ? "Lien copié" : label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Lien copié." : ""}
      </span>
    </>
  );
}
