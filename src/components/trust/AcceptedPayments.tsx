"use client";

import { useEffect, useMemo, useState } from "react";
import { getPaymentConfigAction } from "@/app/actions/payments";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import TrackSectionView from "@/components/analytics/TrackSectionView";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { announcedPaymentMethods } from "@/lib/paymentMethod";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Reusable "Accepted payment methods" display. Never hardcodes methods: it
 * renders exactly the methods that are active/visible in admin (via
 * `getPaymentConfigAction` → `announcedPaymentMethods`), so a disabled method
 * disappears automatically everywhere this component is used.
 *
 * Two render modes:
 *  - `section` (default): a titled premium card grid for the homepage / product
 *    pages.
 *  - `inline`: a compact logo+label row for the footer, cart and checkout.
 *
 * Server parents can pass `initialMethods` (from `getPublicPaymentMethods()`) to
 * avoid a client fetch flash; client-only parents let it self-fetch.
 */
export default function AcceptedPayments({
  initialMethods = null,
  variant = "section",
  title,
  subtitle,
  className,
  showNote = true,
}: {
  initialMethods?: PaymentMethodDTO[] | null;
  variant?: "section" | "inline";
  title?: string;
  subtitle?: string;
  className?: string;
  showNote?: boolean;
}) {
  const [methods, setMethods] = useState<PaymentMethodDTO[] | null>(initialMethods);

  useEffect(() => {
    if (initialMethods) return;
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
  }, [initialMethods]);

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
      <div className={className}>
        <TrackSectionView event="payment_methods_viewed" params={{ variant }} />
        <ul className="flex flex-wrap items-center gap-2.5">
          {options.map((option) => (
            <li
              key={option.method.id}
              className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5"
            >
              <PaymentBrandMark
                display={option.display}
                className="h-[22px] w-[22px] shrink-0 rounded-[7px] text-[8px]"
              />
              <span className="text-[12.5px] font-medium text-muted">
                {option.display.displayName}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      className={className ?? "mt-16"}
      aria-labelledby={title ? "payments-heading" : undefined}
      aria-label={title ? undefined : "Moyens de paiement acceptés"}
    >
      <TrackSectionView event="payment_methods_viewed" params={{ variant }} />
      {title && (
        <div className="max-w-2xl">
          <h2
            id="payments-heading"
            className="text-2xl font-semibold tracking-tight text-text sm:text-[27px]"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1.5 text-sm text-muted sm:text-[15px]">{subtitle}</p>}
        </div>
      )}
      <div className="mt-7 grid gap-[14px] min-[420px]:grid-cols-2 lg:grid-cols-4">
        {options.map((option) => (
          <div
            key={option.method.id}
            className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-4"
          >
            <PaymentBrandMark
              display={option.display}
              className="h-11 w-11 shrink-0 rounded-[11px] text-[11px]"
            />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-text">
                {option.display.displayName}
              </p>
              {option.display.subtitle && (
                <p className="truncate text-[12px] text-faint">{option.display.subtitle}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {showNote && (
        <p className="mt-4 text-[12.5px] text-faint">
          Seuls les moyens de paiement disponibles sont affichés. Vous choisirez le vôtre à
          l&apos;étape de paiement.
        </p>
      )}
    </section>
  );
}
