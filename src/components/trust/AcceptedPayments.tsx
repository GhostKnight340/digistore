"use client";

import { useEffect, useMemo, useState } from "react";
import { getAcceptedPaymentMethodsAction } from "@/app/actions/payments";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import type { ResolvedPaymentDisplay } from "@/lib/paymentDisplay";
import type { AnnouncedPaymentMethodDTO } from "@/lib/dto";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { trackEvent } from "@/lib/analytics";

/**
 * Reusable "accepted payment methods" display. Fetches the live, sanitized
 * list from `getAcceptedPaymentMethodsAction` (branding only — never bank RIB
 * or wallet addresses), so a method disabled in admin disappears automatically
 * and nothing is ever hardcoded. Banks collapse into one "Virement bancaire".
 *
 * Variants:
 *  - "grid":   premium cards for the homepage / product page.
 *  - "inline": compact logo + name row for the footer / checkout.
 *
 * Renders nothing while loading, on error, or when no method is enabled. Fires
 * `payment_methods_viewed` once when scrolled into view.
 */
function toDisplay(method: AnnouncedPaymentMethodDTO): ResolvedPaymentDisplay {
  return {
    displayName: method.name,
    subtitle: method.subtitle,
    initials: method.initials,
    accentColor: method.accentColor,
    logoUrl: method.logoUrl ?? undefined,
  };
}

export default function AcceptedPayments({
  variant = "grid",
  heading,
  className = "",
}: {
  variant?: "grid" | "inline";
  heading?: string;
  className?: string;
}) {
  const [methods, setMethods] = useState<AnnouncedPaymentMethodDTO[] | null>(null);

  useEffect(() => {
    let active = true;
    getAcceptedPaymentMethodsAction()
      .then((list) => {
        if (active) setMethods(list);
      })
      .catch((error) => {
        console.error("[trust] Failed to load accepted payment methods:", error);
        if (active) setMethods([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const options = useMemo(
    () => (methods ?? []).map((method) => ({ method, display: toDisplay(method) })),
    [methods],
  );

  const { ref } = useInViewOnce<HTMLElement>(() => {
    if (options.length > 0) {
      trackEvent("payment_methods_viewed", { variant, count: options.length });
    }
  });

  if (options.length === 0) return null;

  if (variant === "inline") {
    return (
      <section ref={ref} className={className} aria-label="Moyens de paiement acceptés">
        {heading && (
          <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">
            {heading}
          </div>
        )}
        <ul className="flex flex-wrap items-center gap-2.5">
          {options.map((option) => (
            <li
              key={option.method.id}
              className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface2 px-2.5 py-1.5"
            >
              <PaymentBrandMark
                display={option.display}
                className="h-[22px] w-[22px] shrink-0 rounded-[7px] text-[8px]"
              />
              <span className="text-[12.5px] font-medium text-text">
                {option.display.displayName}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section ref={ref} className={`mt-16 ${className}`}>
      <div className="rounded-[20px] border border-border bg-gradient-to-b from-surface to-surface/40 px-6 py-10 sm:px-11">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-text">
          {heading ?? "Moyens de paiement acceptés"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-muted">
          Payez en toute confiance avec les méthodes disponibles au Maroc.
        </p>
        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
          {options.map((option) => (
            <li
              key={option.method.id}
              className="flex min-w-[150px] flex-1 items-center gap-3 rounded-[14px] border border-border bg-surface2 p-4 sm:max-w-[220px]"
            >
              <PaymentBrandMark
                display={option.display}
                className="h-11 w-11 shrink-0 rounded-[11px] text-[11px]"
              />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-text">
                  {option.display.displayName}
                </div>
                {option.display.subtitle && (
                  <div className="truncate text-[12px] text-muted">
                    {option.display.subtitle}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
