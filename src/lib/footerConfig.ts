import type { StoreSettings } from "./storeSettings";
import type { ProductListItemDTO } from "./dto";
import { absoluteAppUrl } from "./orderNumber";

export type FooterProductLink = { slug: string; name: string; href: string };

/**
 * Resolves the admin-curated footer "Produits" list against the live parent
 * products: keeps only enabled entries whose product still exists and is
 * active, orders them by sortOrder, uses the product's current name, and
 * applies the optional max-items cap. Single source of truth for the footer.
 */
export function getFooterProductLinks(
  settings: StoreSettings,
  parentProducts: ProductListItemDTO[],
): FooterProductLink[] {
  const bySlug = new Map(parentProducts.map((product) => [product.slug, product]));
  const resolved = [...(settings.footer.productLinks ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((link) => link.enabled)
    .map((link) => bySlug.get(link.productSlug))
    .filter((product): product is ProductListItemDTO => Boolean(product && product.active))
    .map((product) => ({
      slug: product.slug,
      name: product.name,
      href: `/products/${product.slug}`,
    }));

  const max = settings.footer.productLinksMaxItems ?? 0;
  return max > 0 ? resolved.slice(0, max) : resolved;
}

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

/** All payment badges (enabled or not), ordered by sortOrder — for admin editing. */
export function getFooterPaymentBadges(settings: StoreSettings) {
  return [...settings.footer.paymentBadges].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Enabled payment badges, ordered by sortOrder. Single source of truth consumed
 * by the public website footer AND the email footer (preview + real emails).
 */
export function getEnabledFooterPaymentBadges(settings: StoreSettings) {
  return getFooterPaymentBadges(settings).filter((badge) => badge.enabled);
}

export function emailIconUrl(iconPath: string) {
  return absoluteAppUrl(iconPath);
}
