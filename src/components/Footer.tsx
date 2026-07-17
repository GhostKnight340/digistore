"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProductCatalog } from "@/context/ProductCatalogContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getFooterSocialLinks } from "@/lib/footerConfig";
import { categoryHref } from "@/lib/categoryUrl";
import AcceptedPayments from "@/components/trust/AcceptedPayments";

export default function Footer() {
  const { settings } = useStoreSettings();
  const { categories } = useProductCatalog();
  const pathname = usePathname();

  // Self-hide on the admin area, client-side (see Navbar for the rationale).
  if (pathname.startsWith("/admin")) return null;
  if (!settings.homepage.showFooter) return null;

  const socialLinks = getFooterSocialLinks(settings);

  return (
    <footer className="mt-20 border-t border-border bg-canvas/60">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/navigator-icon-64.png"
              alt=""
              width={26}
              height={26}
              className="h-[26px] w-[26px]"
              loading="lazy"
              decoding="async"
            />
            <span className="text-base font-semibold text-white">
              {settings.branding.logoText}
            </span>
          </div>
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-muted">
            {settings.footer.supportText}
          </p>
          <div className="mt-4 space-y-1 text-xs text-muted">
            <p>E-mail : {settings.footer.contactEmail}</p>
            <p>WhatsApp : {settings.footer.whatsappNumber}</p>
          </div>
          {/* Real, admin-configured accepted methods — disabled methods vanish
              automatically. Self-fetches (footer is a client component). */}
          <AcceptedPayments variant="inline" showNote={false} className="mt-5" />
          {socialLinks.length > 0 && (
            <div className="mt-5 flex items-center gap-2">
              {socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.ariaLabel}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-muted transition hover:border-accent/50 hover:text-white"
                >
                  <span
                    className="h-4 w-4 bg-current"
                    style={{
                      WebkitMask: `url(${link.iconPath}) center / contain no-repeat`,
                      mask: `url(${link.iconPath}) center / contain no-repeat`,
                    }}
                  />
                </a>
              ))}
            </div>
          )}
        </div>

        <FooterGroup
          title="Produits"
          links={categories.slice(0, 4).map((category) => ({
            href: categoryHref(category),
            label: category.name,
          }))}
        />
        <FooterGroup
          title="Aide"
          links={[
            { href: "/support", label: "Centre d'aide" },
            { href: "/guides", label: "Guides d'activation" },
            { href: "/faq", label: "Questions fréquentes" },
            { href: "/#how-it-works", label: "Comment ça marche" },
            { href: "/contact", label: "Contact" },
            { href: "/account", label: "Statut des commandes" },
          ]}
        />
        <FooterGroup
          title="Légal"
          links={[
            { href: "/terms", label: "Conditions" },
            { href: "/privacy", label: "Confidentialité" },
            { href: "/refunds", label: "Remboursements" },
            { href: "/legal", label: "Mentions légales" },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-4 text-[13px] text-faint sm:flex-row">
          <span>
            © {new Date().getFullYear()} {settings.branding.siteName}. Tous
            droits réservés.
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Français - DH
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-3 space-y-2.5">
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <Link
              href={link.href}
              className="text-[13.5px] text-muted transition hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
