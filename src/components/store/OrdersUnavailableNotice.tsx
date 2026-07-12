"use client";

import Link from "next/link";
import { ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";

/**
 * Polished "orders temporarily unavailable" notice shown on the product page,
 * cart, checkout and payment pages while the global "Accept customer orders"
 * toggle is OFF. Copy is centralized in ORDERS_UNAVAILABLE_COPY so the wording
 * stays identical everywhere. Purely presentational — callers decide when to
 * render it (via isOrderingEnabled).
 */
export default function OrdersUnavailableNotice({
  className = "",
  showContact = true,
}: {
  className?: string;
  showContact?: boolean;
}) {
  return (
    <div
      role="status"
      className={`card border-accent/20 bg-accent-soft p-6 sm:p-7 ${className}`}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent-strong"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
            <circle cx="12" cy="12" r="9" />
            <line x1="10" y1="9" x2="10" y2="15" />
            <line x1="14" y1="9" x2="14" y2="15" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Pré-lancement
          </p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-white">
            {ORDERS_UNAVAILABLE_COPY.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {ORDERS_UNAVAILABLE_COPY.body}
          </p>
          {showContact ? (
            <Link
              href={ORDERS_UNAVAILABLE_COPY.contactHref}
              className="btn-ghost mt-4 h-10"
            >
              {ORDERS_UNAVAILABLE_COPY.contactLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
