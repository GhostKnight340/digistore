"use client";

import { trackEvent } from "@/lib/analytics";

/**
 * Prints the guide via the browser's print dialog. Paired with `@media print`
 * rules that strip the site chrome and switch to light ink, so a customer can
 * keep a clean paper copy of the activation steps beside their device.
 */
export default function GuidePrintButton({ slug }: { slug: string }) {
  function onPrint() {
    trackEvent("guide_print", { guide: slug });
    if (typeof window !== "undefined") window.print();
  }

  return (
    <button type="button" onClick={onPrint} className="btn-ghost inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M6 9V3h12v6" />
        <rect x="6" y="14" width="12" height="7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
      </svg>
      Imprimer
    </button>
  );
}
