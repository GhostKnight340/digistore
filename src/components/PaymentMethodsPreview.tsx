"use client";

import { useEffect, useMemo, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getPaymentConfigAction } from "@/app/actions/payments";
import { buildPaymentOptions, type PaymentCardOption } from "@/lib/paymentOptions";
import PaymentBrandMark from "@/components/PaymentBrandMark";
import type { PaymentConfigDTO } from "@/lib/dto";

/** Small live preview of enabled payment methods, shown before checkout (e.g. on the cart page). */
export default function PaymentMethodsPreview() {
  const { settings } = useStoreSettings();
  const [config, setConfig] = useState<PaymentConfigDTO | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPaymentConfigAction()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((err: unknown) => {
        console.error("[cart] Failed to load payment config:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<PaymentCardOption[]>(() => {
    if (!config) return [];
    return buildPaymentOptions(config, settings.paymentDisplay);
  }, [config, settings.paymentDisplay]);

  if (error) return null;
  if (!config) return null;

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Modes de paiement acceptés
      </h3>
      {options.length === 0 ? (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          Aucun mode de paiement disponible pour le moment.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => (
            <li
              key={option.id}
              className="chip"
              title={option.display.displayName}
            >
              <PaymentBrandMark display={option.display} className="h-4 w-4 shrink-0" />
              <span>{option.display.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
