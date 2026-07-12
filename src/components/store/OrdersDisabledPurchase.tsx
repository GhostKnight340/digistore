"use client";

import Link from "next/link";
import { ORDERS_UNAVAILABLE_COPY } from "@/lib/storeSettings";

/**
 * Drop-in replacement for a product's purchase buttons (Buy now / Add to cart)
 * and the cart's checkout button while ordering is disabled. Renders a disabled
 * primary button plus an optional "Nous contacter" secondary action, keeping
 * the same button footprint so surrounding layout does not shift.
 */
export default function OrdersDisabledPurchase({
  className = "",
  primaryHeightClass = "h-[52px]",
}: {
  className?: string;
  /** Match the height of the buttons being replaced so the layout is stable. */
  primaryHeightClass?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={ORDERS_UNAVAILABLE_COPY.title}
        className={`btn-primary w-full text-base ${primaryHeightClass}`}
      >
        {ORDERS_UNAVAILABLE_COPY.buttonLabel}
      </button>
      <Link href={ORDERS_UNAVAILABLE_COPY.contactHref} className="btn-ghost h-11 w-full">
        {ORDERS_UNAVAILABLE_COPY.contactLabel}
      </Link>
    </div>
  );
}
