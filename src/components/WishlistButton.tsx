"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWishlist } from "@/context/WishlistContext";
import { trackEvent } from "@/lib/analytics";

/**
 * Heart/save toggle for a parent product (keyed by slug). Uses the shared
 * WishlistContext so every instance for the same product stays in sync.
 *
 * Accessibility: a real button with an accessible name that reflects state
 * ("Ajouter aux favoris" / "Retirer des favoris"), a visible focus ring, a
 * large-enough tap target, and a polite live announcement — state is conveyed by
 * label + filled icon, never colour alone. Guests are prompted to log in to sync
 * but their choice is still kept locally.
 */
export default function WishlistButton({
  slug,
  variant = "overlay",
  className = "",
}: {
  slug: string;
  /** "overlay" = compact icon for cards; "inline" = icon + label. */
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const { isSaved, toggle, enabled, authenticated } = useWishlist();
  const router = useRouter();
  const [announce, setAnnounce] = useState("");
  const saved = isSaved(slug);

  if (!enabled) return null;

  function onClick(e: React.MouseEvent) {
    // Cards wrap the heart near a Link; never trigger navigation.
    e.preventDefault();
    e.stopPropagation();
    const willSave = !saved;
    toggle(slug);
    trackEvent("wishlist_toggle", { saved: willSave });
    setAnnounce(willSave ? "Ajouté aux favoris." : "Retiré des favoris.");
    // Nudge guests toward syncing, without losing their local choice.
    if (willSave && !authenticated) {
      router.prefetch?.("/login");
    }
  }

  const label = saved ? "Retirer des favoris" : "Ajouter aux favoris";

  const heart = (
    <svg
      viewBox="0 0 24 24"
      fill={saved ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={variant === "inline" ? "h-4 w-4" : "h-[18px] w-[18px]"}
      aria-hidden
    >
      <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l1.7 1.7L12 21.5l7.1-7.1 1.7-1.7a5 5 0 0 0 0-7.1z" />
    </svg>
  );

  if (variant === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={saved}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            saved
              ? "border-accent/60 bg-accent/10 text-accent"
              : "border-border bg-surface text-muted hover:border-accent hover:text-white"
          } ${className}`}
        >
          {heart}
          <span>{saved ? "Favoris" : "Ajouter aux favoris"}</span>
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {announce}
        </span>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={`grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          saved
            ? "border-accent/60 bg-accent/20 text-accent"
            : "border-white/15 bg-black/40 text-white/80 hover:border-accent hover:text-white"
        } ${className}`}
      >
        {heart}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
