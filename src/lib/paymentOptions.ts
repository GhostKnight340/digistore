import {
  bankDisplayKey,
  methodDisplayKey,
  resolvePaymentDisplay,
  type ResolvedPaymentDisplay,
} from "@/lib/paymentDisplay";
import type { PaymentDisplaySetting } from "@/lib/storeSettings";
import type { PaymentMethod } from "@/lib/types";
import type { BankDTO, PaymentConfigDTO } from "@/lib/dto";

export const METHOD_META: Record<string, { label: string; hint: string; icon: string }> = {
  bank: { label: "Virement bancaire", hint: "RIB / IBAN disponibles", icon: "BK" },
  usdt: { label: "Crypto", hint: "Paiement crypto rapide", icon: "US" },
  paypal: { label: "PayPal", hint: "PayPal ou envoi manuel", icon: "PP" },
  card: { label: "Carte bancaire", hint: "Disponible prochainement", icon: "CB" },
};

export type PaymentCardOption =
  | { id: string; method: "bank"; display: ResolvedPaymentDisplay; bank: BankDTO }
  | { id: string; method: Exclude<PaymentMethod, "bank">; display: ResolvedPaymentDisplay };

export function isMethodUsable(config: PaymentConfigDTO, method: PaymentMethod): boolean {
  if (!config.methods[method]?.enabled) return false;
  if (method === "bank") return config.banks.length > 0;
  if (method === "usdt") return config.wallets.length > 0;
  return true;
}

export function getEnabledMethods(config: PaymentConfigDTO): PaymentMethod[] {
  return (["bank", "usdt", "paypal", "card"] as PaymentMethod[]).filter((m) =>
    isMethodUsable(config, m),
  );
}

export function buildPaymentOptions(
  config: PaymentConfigDTO,
  paymentDisplay: Record<string, PaymentDisplaySetting>,
): PaymentCardOption[] {
  const options: PaymentCardOption[] = [];
  if (config.methods.bank?.enabled) {
    options.push(
      ...config.banks.map((bank) => ({
        id: `bank:${bank.id}`,
        method: "bank" as const,
        display: resolvePaymentDisplay(paymentDisplay[bankDisplayKey(bank.id)], {
          displayName: bank.name,
          subtitle: "Virement bancaire",
          initials: bank.name.slice(0, 2).toUpperCase(),
          accentColor: "#3e7bfa",
        }),
        bank,
      })),
    );
  }
  for (const optionMethod of ["usdt", "paypal", "card"] as const) {
    if (!isMethodUsable(config, optionMethod)) continue;
    const meta = METHOD_META[optionMethod];
    options.push({
      id: optionMethod,
      method: optionMethod,
      display: resolvePaymentDisplay(paymentDisplay[methodDisplayKey(optionMethod)], {
        displayName: meta.label,
        subtitle: meta.hint,
        initials: meta.icon,
        accentColor:
          optionMethod === "usdt"
            ? "#22c55e"
            : optionMethod === "paypal"
              ? "#3e7bfa"
              : "#8b5cf6",
      }),
    });
  }
  return options;
}
