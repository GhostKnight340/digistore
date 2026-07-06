import type { PaymentMethodDTO } from "@/lib/dto";

export type ResolvedPaymentDisplay = {
  displayName: string;
  subtitle: string;
  initials: string;
  accentColor: string;
  logoUrl?: string;
  iconUrl?: string;
};

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

/** Branding now lives directly on each PaymentMethod row. */
export function paymentMethodDisplay(method: PaymentMethodDTO): ResolvedPaymentDisplay {
  const hasImage = method.logoType !== "initials" && Boolean(method.logoUrl);
  return {
    displayName: method.name,
    subtitle: method.subtitle,
    initials: (method.initials || fallbackInitials(method.name)).slice(0, 4).toUpperCase(),
    accentColor: method.accentColor || "#3e7bfa",
    logoUrl: hasImage ? method.logoUrl ?? undefined : undefined,
  };
}
