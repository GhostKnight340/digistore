import type { FooterPaymentBadgeSetting, StoreSettings } from "./storeSettings";
import type { PaymentMethodDTO } from "./dto";
import { announcedPaymentMethods } from "./paymentMethod";
import { absoluteAppUrl } from "./orderNumber";

export type FooterSocialLink = {
  id: "instagram" | "whatsapp";
  label: string;
  href: string;
  iconPath: string;
  ariaLabel: string;
};

export function normalizeWhatsappNumber(value: string) {
  return value.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export function whatsappUrl(value: string) {
  const normalized = normalizeWhatsappNumber(value);
  return normalized ? `https://wa.me/${normalized}` : "";
}

export function getFooterSocialLinks(settings: StoreSettings): FooterSocialLink[] {
  const instagramUrl = settings.footer.socialLinks.instagram.trim();
  const whatsappHref = whatsappUrl(settings.footer.whatsappNumber);

  return [
    instagramUrl
      ? {
          id: "instagram",
          label: "Instagram",
          href: instagramUrl,
          iconPath: "/social-instagram.svg",
          ariaLabel: "Ouvrir Instagram Ghost.ma",
        }
      : null,
    whatsappHref
      ? {
          id: "whatsapp",
          label: "WhatsApp",
          href: whatsappHref,
          iconPath: "/social-whatsapp.svg",
          ariaLabel: "Contacter Ghost.ma sur WhatsApp",
        }
      : null,
  ].filter((link): link is FooterSocialLink => Boolean(link));
}

export function getEnabledFooterPaymentBadges(settings: StoreSettings) {
  return settings.footer.paymentBadges.filter((badge) => badge.enabled);
}

/** Badge ids of the form `method:<paymentMethodId>` reference a live
 *  PaymentMethod row (the "Modes de paiement" registry); anything else is a
 *  static network badge (visa, mastercard, …) with no backing row. */
export const FOOTER_BADGE_METHOD_PREFIX = "method:";

/** Static card-network badges always offered in admin alongside the live
 *  payment methods. They are networks, not methods, so they never map to a
 *  PaymentMethod row. */
export const STATIC_FOOTER_BADGES: { id: string; label: string }[] = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
];

export type ResolvedFooterBadge = {
  id: string;
  label: string;
  /** Present for badges linked to a live payment method — carries branding. */
  method?: PaymentMethodDTO;
};

/**
 * Single source of truth for footer/e-mail payment badges: enabled badge
 * settings resolved against the live payment-method registry.
 *  - `method:<id>` badges take their label (and branding) from the live method
 *    and are dropped when the method is archived/deactivated/hidden.
 *  - Static badges keep their stored label, but are deduped (by label) against
 *    resolved method badges so legacy entries like "PayPal" don't double up.
 */
export function resolveFooterPaymentBadges(
  settings: StoreSettings,
  methods: PaymentMethodDTO[],
): ResolvedFooterBadge[] {
  const announced = announcedPaymentMethods(methods);
  const resolved: ResolvedFooterBadge[] = [];

  for (const badge of getEnabledFooterPaymentBadges(settings)) {
    if (badge.id.startsWith(FOOTER_BADGE_METHOD_PREFIX)) {
      const methodId = badge.id.slice(FOOTER_BADGE_METHOD_PREFIX.length);
      const method = announced.find((item) => item.id === methodId);
      if (method) resolved.push({ id: badge.id, label: method.name, method });
    } else {
      resolved.push({ id: badge.id, label: badge.label });
    }
  }

  const methodLabels = new Set(
    resolved
      .filter((badge) => badge.method)
      .map((badge) => badge.label.trim().toLowerCase()),
  );
  return resolved.filter(
    (badge) => badge.method || !methodLabels.has(badge.label.trim().toLowerCase()),
  );
}

/** Convenience for admin UIs: the full toggle list (static networks + one entry
 *  per announced live method), with enabled state read from stored settings.
 *  Stale stored badges that no longer match anything are dropped. */
export function footerBadgeOptions(
  stored: FooterPaymentBadgeSetting[],
  methods: PaymentMethodDTO[],
): FooterPaymentBadgeSetting[] {
  const enabledById = new Map(stored.map((badge) => [badge.id, badge.enabled]));
  const enabledByLabel = new Map(
    stored.map((badge) => [badge.label.trim().toLowerCase(), badge.enabled]),
  );
  const lookup = (id: string, label: string) =>
    enabledById.get(id) ?? enabledByLabel.get(label.trim().toLowerCase()) ?? false;

  const methodOptions = announcedPaymentMethods(methods).map((method) => ({
    id: `${FOOTER_BADGE_METHOD_PREFIX}${method.id}`,
    label: method.name,
    enabled: lookup(`${FOOTER_BADGE_METHOD_PREFIX}${method.id}`, method.name),
  }));
  const methodLabels = new Set(methodOptions.map((o) => o.label.trim().toLowerCase()));
  const staticOptions = STATIC_FOOTER_BADGES.filter(
    (badge) => !methodLabels.has(badge.label.trim().toLowerCase()),
  ).map((badge) => ({ ...badge, enabled: lookup(badge.id, badge.label) }));

  return [...staticOptions, ...methodOptions];
}

export function emailIconUrl(iconPath: string) {
  return absoluteAppUrl(iconPath);
}
