"use client";

import { useEffect, useMemo, useState } from "react";
import { getPaymentConfigAction } from "@/app/actions/payments";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Compact read-only list of the payment methods a customer can use, for the
 * cart order summary. Same source and collapsing rules as the checkout list;
 * renders nothing while loading, on error, or when no method is enabled.
 */
export default function PaymentMethodsPreview() {
  const [methods, setMethods] = useState<PaymentMethodDTO[] | null>(null);

  useEffect(() => {
    getPaymentConfigAction()
      .then((config) => setMethods(config.methods))
      .catch((error) => {
        console.error("[cart] Failed to load payment methods preview:", error);
      });
  }, []);

  const options = useMemo(
    () =>
      announcedPaymentMethods(methods ?? []).map((method) => ({
        method,
        display: paymentMethodDisplay(method),
      })),
    [methods],
  );

  if (options.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">
        Modes de paiement acceptés
      </div>
      <ul className="mt-3 space-y-2">
        {options.map((option) => (
          <li key={option.method.id} className="flex items-center gap-2.5">
            <PaymentBrandMark
              display={option.display}
              className="h-[26px] w-[26px] shrink-0 rounded-[8px] text-[9px]"
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
              {option.display.displayName}
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5BC98C"
              strokeWidth={2.6}
              className="h-3 w-3 shrink-0"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
        Vous choisirez votre méthode à l&apos;étape de paiement.
      </p>
    </div>
  );
}
