import type { PaymentMethod } from "@/lib/types";
import type { PaymentDisplaySetting } from "@/lib/storeSettings";

export type PaymentDisplayFallback = {
  displayName: string;
  subtitle: string;
  initials?: string;
  accentColor?: string;
  logoUrl?: string;
  iconUrl?: string;
};

export type ResolvedPaymentDisplay = {
  displayName: string;
  subtitle: string;
  initials: string;
  accentColor: string;
  logoUrl?: string;
  iconUrl?: string;
};

export function methodDisplayKey(method: PaymentMethod | string) {
  return `method:${method}`;
}

export function bankDisplayKey(id: string) {
  return `bank:${id}`;
}

export function walletDisplayKey(id: string) {
  return `wallet:${id}`;
}

export function fallbackInitials(label: string) {
  const words = label
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  const initials =
    words.length > 1
      ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`
      : (words[0] ?? label).slice(0, 2);

  return initials.toUpperCase() || "PM";
}

export function resolvePaymentDisplay(
  setting: PaymentDisplaySetting | undefined,
  fallback: PaymentDisplayFallback,
): ResolvedPaymentDisplay {
  const displayName = setting?.displayName?.trim() || fallback.displayName;
  const subtitle = setting?.subtitle?.trim() || fallback.subtitle;
  const initials =
    setting?.initials?.trim() ||
    fallback.initials ||
    fallbackInitials(displayName);
  const logoUrl = setting?.logoUrl?.trim() || fallback.logoUrl;
  const iconUrl = setting?.iconUrl?.trim() || fallback.iconUrl;

  return {
    displayName,
    subtitle,
    initials: initials.slice(0, 4).toUpperCase(),
    accentColor:
      setting?.accentColor?.trim() || fallback.accentColor || "#3e7bfa",
    logoUrl: setting?.logoType === "initials" ? undefined : logoUrl,
    iconUrl: setting?.logoType === "initials" ? undefined : iconUrl,
  };
}
