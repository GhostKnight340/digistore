import type { StoreSettings } from "./storeSettings";
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

export function emailIconUrl(iconPath: string) {
  return absoluteAppUrl(iconPath);
}
