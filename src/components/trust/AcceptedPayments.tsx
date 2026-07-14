"use client";

import { useEffect, useMemo, useState } from "react";
import { getPaymentConfigAction } from "@/app/actions/payments";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import { useTrackOnView } from "@/hooks/useTrackOnView";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import { TRUST_EVENTS } from "@/lib/trust/content";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Accepted payment methods — the single reusable surface for "which methods can
 * I pay with?". Reuses the live payment configuration (`getPaymentConfigAction`
 * + `announcedPaymentMethods`) so DISABLED methods disappear automatically and
 * nothing is ever hardcoded. Renders nothing while loading, on error, or when no
 * method is enabled.
 *
 * Variants:
 *  - "section" : titled premium card grid (homepage / product page).
 *  - "inline"  : compact logo row with a heading (footer / payment page).
 */
export default function AcceptedPayments({
  variant = "section",
  title = "Moyens de paiement acceptés",
  subtitle = "Payez avec la méthode qui vous convient. Seules les méthodes disponibles sont affichées.",
  className = "",
}: {
  variant?: "section" | "inline";
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const [methods, setMethods] = useState<PaymentMethodDTO[] | null>(null);
  const ref = useTrackOnView<HTMLDivElement>(TRUST_EVENTS.paymentsViewed, {
    variant,
  });

  useEffect(() => {
    let active = true;
    getPaymentConfigAction()
      .then((config) => {
        if (active) setMethods(config.methods);
      })
      .catch((error) => {
        console.error("[trust] Failed to load payment methods:", error);
      });
    return () => {
      active = false;
    };
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

  if (variant === "inline") {
    return (
      <div ref={ref} className={className}>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          {title}
        </div>
        <ul className="mt-3 flex flex-wrap items-center gap-2.5">
          {options.map((option) => (
            <li
              key={option.method.id}
              className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5"
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
      </div>
    );
  }

  return (
    <section ref={ref} className={`mt-16 ${className}`}>
      <h2 className="text-2xl font-semibold tracking-tight text-text">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-6 grid gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <article
            key={option.method.id}
            className="flex items-center gap-3.5 rounded-[14px] border border-border bg-surface2 p-4"
          >
            <PaymentBrandMark
              display={option.display}
              className="h-[38px] w-[38px] shrink-0 rounded-[10px] text-[11px]"
            />
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-semibold text-text">
                {option.display.displayName}
              </div>
              {option.display.subtitle && (
                <div className="mt-0.5 truncate text-[12.5px] text-muted">
                  {option.display.subtitle}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
