"use client";

import { useEffect, useState } from "react";
import { getPaymentConfigAction } from "@/app/actions/payments";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import PaymentBadge from "@/components/PaymentBadge";
import { paymentMethodDisplay } from "@/lib/paymentDisplay";
import { resolveFooterPaymentBadges } from "@/lib/footerConfig";
import type { PaymentMethodDTO } from "@/lib/dto";

/**
 * Footer payment badges — the admin-selected subset from "Boutique → Pied de
 * page", resolved against the live payment-method registry (same resolver as
 * the e-mail footer, so site and e-mails can never drift). Method-linked
 * badges render with their real branding via `PaymentBadge`; static network
 * badges (Visa, Mastercard) render as neutral pills.
 */
export default function FooterPaymentBadges({ className }: { className?: string }) {
  const { settings } = useStoreSettings();
  const [methods, setMethods] = useState<PaymentMethodDTO[] | null>(null);

  useEffect(() => {
    let active = true;
    getPaymentConfigAction()
      .then((config) => {
        if (active) setMethods(config.methods);
      })
      .catch((error) => {
        console.error("[footer] Failed to load payment methods:", error);
        if (active) setMethods([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Wait for the fetch so method-linked badges don't pop in after the pills.
  if (methods === null) return null;
  const badges = resolveFooterPaymentBadges(settings, methods);
  if (badges.length === 0) return null;

  return (
    <div className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {badges.map((badge) => (
          <li key={badge.id}>
            {badge.method ? (
              <PaymentBadge
                method={badge.method}
                display={paymentMethodDisplay(badge.method)}
                size="compact"
              />
            ) : (
              <span className="inline-flex h-[30px] items-center rounded-lg border border-border bg-surface px-[11px] text-[11.5px] font-medium tracking-[0.005em] text-muted [box-shadow:0_1px_4px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]">
                {badge.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
