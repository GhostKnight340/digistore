"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import FeedbackDialog from "./FeedbackDialog";

/**
 * Edge-mounted "Votre avis" trigger. Bottom-LEFT so it never overlaps the
 * Navigator support pill (bottom-right), the cart, or account actions. Hidden on
 * admin, checkout/payment (crowded), and the support flow (redundant). Opens a
 * modal on desktop and a bottom sheet on mobile. Respects safe-area insets.
 */
export default function FeedbackButton({
  customer,
}: {
  customer: { name: string; email: string } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Deep-link open (e.g. the account "Envoyer une suggestion" link).
  useEffect(() => {
    if (searchParams.get("feedback") === "1") setOpen(true);
  }, [searchParams]);

  const hidden =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/payment") ||
    pathname.startsWith("/support");

  if (hidden) return null;

  function openDialog() {
    setOpen(true);
    trackEvent("feedback_open", {});
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-label="Donner votre avis"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3.5 py-2.5 text-sm font-medium text-muted shadow-card backdrop-blur transition hover:border-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:px-4"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-accent"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        </svg>
        <span className="hidden sm:inline">Votre avis</span>
      </button>

      <FeedbackDialog open={open} onClose={() => setOpen(false)} customer={customer} />
    </>
  );
}
