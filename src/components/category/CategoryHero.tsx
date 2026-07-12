import Link from "next/link";
import { Sora } from "next/font/google";
import type { Category } from "@/lib/types";
import { isValidCtaUrl, type CategoryLanding } from "@/lib/categoryLanding";
import { resolveBrandColor, canonicalBrandKey } from "@/lib/brandAssets";

/**
 * Brand-parameterized category hero — the approved "Category Hero" design
 * (see design/Category Hero/). Full-bleed dark band with a brand-tinted halo,
 * a decorative fan of three of our own card designs bleeding off the right
 * edge, and badge + headline + subcopy + two CTAs on the left. One component,
 * one accent per brand; all tints derive from that single accent via the
 * `--accent` custom property (see `.cathero*` in globals.css). Renders the
 * category name context as the page <h1>. Copy strings are final per brand and
 * copied verbatim from the design's BRANDS map — where a brand is matched, the
 * design copy wins over admin landing fields.
 */

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

type Brand = {
  name: string;
  badge: string;
  accent: string;
  logo: string;
  logoMuted: string;
  denoms: [number, number, number];
  unit: string;
  headline: string;
  subcopy: string;
};

// Verbatim from design/Category Hero/reference_Category Hero.dc.html (BRANDS).
// PlayStation/Xbox/Apple accents are the brightened dark-bg UI values, not the
// raw brand hexes — keep them as-is.
const BRANDS: Record<string, Brand> = {
  steam: {
    name: "Steam Wallet", badge: "Steam Wallet Maroc", accent: "#66C0F4",
    logo: "/marques/steam.svg", logoMuted: "/marques/white/steam.svg",
    denoms: [5, 20, 100], unit: "EUR",
    headline: "Rechargez votre Steam Wallet",
    subcopy:
      "Choisissez votre montant — 5, 10, 20, 50 ou 100 € — payez avec un moyen de paiement marocain et recevez votre code officiel par e-mail en quelques minutes.",
  },
  playstation: {
    name: "PlayStation Store", badge: "PlayStation Store Maroc", accent: "#4a9eff",
    logo: "/marques/playstation.svg", logoMuted: "/marques/white/playstation.svg",
    denoms: [10, 25, 50], unit: "EUR",
    headline: "Cartes PlayStation Store",
    subcopy:
      "Jeux, extensions et abonnements PlayStation Plus sur le PSN — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  xbox: {
    name: "Xbox", badge: "Xbox Maroc", accent: "#3fae3f",
    logo: "/marques/xbox.svg", logoMuted: "/marques/white/xbox.svg",
    denoms: [5, 25, 100], unit: "EUR",
    headline: "Cartes cadeaux Xbox",
    subcopy:
      "Jeux, Game Pass et contenus sur le Microsoft Store — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  "google-play": {
    name: "Google Play", badge: "Google Play Maroc", accent: "#00F076",
    logo: "/marques/google-play.svg", logoMuted: "/marques/white/google-play.svg",
    denoms: [5, 25, 100], unit: "EUR",
    headline: "Cartes cadeaux Google Play",
    subcopy:
      "Applications, jeux et abonnements sur le Play Store — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  itunes: {
    name: "iTunes", badge: "iTunes Maroc", accent: "#FB5BC5",
    logo: "/marques/itunes.svg", logoMuted: "/marques/white/itunes.svg",
    denoms: [5, 25, 100], unit: "EUR",
    headline: "Cartes cadeaux iTunes",
    subcopy:
      "Musique, films, apps et services Apple — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  apple: {
    name: "Apple Gift Card", badge: "Apple Maroc", accent: "#c9d1d9",
    logo: "/marques/apple.svg", logoMuted: "/marques/white/apple.svg",
    denoms: [5, 25, 100], unit: "EUR",
    headline: "Apple Gift Card",
    subcopy:
      "Apps, jeux, iCloud+ et tout l'écosystème Apple — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  netflix: {
    name: "Netflix", badge: "Netflix Maroc", accent: "#E50914",
    logo: "/marques/netflix.svg", logoMuted: "/marques/white/netflix.svg",
    denoms: [15, 25, 50], unit: "EUR",
    headline: "Cartes cadeaux Netflix",
    subcopy:
      "Créditez votre compte Netflix sans carte bancaire — payez en dirhams et recevez votre code officiel par e-mail en quelques minutes.",
  },
  pubg: {
    name: "PUBG Mobile", badge: "PUBG Mobile Maroc", accent: "#F2A900",
    logo: "/marques/pubg.svg", logoMuted: "/marques/white/pubg.svg",
    denoms: [60, 325, 660], unit: "UC",
    headline: "UC PUBG Mobile",
    subcopy:
      "Rechargez vos UC directement sur votre compte PUBG Mobile — paiement marocain, livraison par e-mail en quelques minutes.",
  },
  "free-fire": {
    name: "Free Fire", badge: "Free Fire Maroc", accent: "#FFB300",
    logo: "/marques/free-fire.png", logoMuted: "/marques/free-fire.png",
    denoms: [100, 310, 520], unit: "Diamants",
    headline: "Diamants Free Fire",
    subcopy:
      "Rechargez vos diamants directement sur votre compte Free Fire — paiement marocain, livraison par e-mail en quelques minutes.",
  },
};

/** True when the category matches a designed brand hero (drives the fan + copy). */
export function categoryHasBrandHero(category: Category): boolean {
  return Boolean(BRANDS[canonicalBrandKey(category.slug ?? category.id)]);
}

export default function CategoryHero({
  category,
  landing,
}: {
  category: Category;
  landing: CategoryLanding;
}) {
  const key = canonicalBrandKey(category.slug ?? category.id);
  const brand = BRANDS[key];

  // Matched brand → design copy + accent + card fan. Otherwise a graceful
  // fallback: same dark hero and halo, driven by the category's own name /
  // accent / admin subtitle, with the (denomination-dependent) card fan hidden.
  const accent = brand
    ? brand.accent
    : resolveBrandColor(category.slug ?? category.id, category.accentColor);
  const badge = brand ? brand.badge : category.name;
  const headline = brand ? brand.headline : category.name;
  const subcopy = brand ? brand.subcopy : landing.heroSubtitle;
  const showCards = Boolean(brand);

  // Primary CTA: scroll to the product section by default, or an explicit
  // internal/external destination when configured and valid.
  const primaryHref =
    landing.primaryCtaMode === "url" && isValidCtaUrl(landing.primaryCtaUrl)
      ? landing.primaryCtaUrl
      : "#products";
  const primaryLabel = landing.primaryCtaLabel || "Voir les produits";

  // Secondary CTA: an admin-configured link when valid, else the support flow.
  const secondaryConfigured =
    Boolean(landing.secondaryCtaLabel) && isValidCtaUrl(landing.secondaryCtaUrl);
  const secondaryHref = secondaryConfigured ? landing.secondaryCtaUrl : "/support";
  const secondaryLabel = secondaryConfigured
    ? landing.secondaryCtaLabel
    : "Contacter le support";

  return (
    <section
      className={`cathero ${sora.className}`}
      style={{ ["--accent" as string]: accent }}
    >
      <div className="cathero__halo" aria-hidden />
      <div className="cathero__grid" aria-hidden />

      {showCards && brand && (
        <div className="cathero__fan" aria-hidden="true">
          {/* back card */}
          <div className="cathero__card cathero__card--back">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoMuted} alt="" className="cathero__logo" style={{ width: 34, height: 34, opacity: 0.7 }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="cathero__denom" style={{ fontSize: 34 }}>{brand.denoms[2]}</span>
              <span className="cathero__unit" style={{ fontSize: 15 }}>{brand.unit}</span>
            </div>
          </div>

          {/* middle card */}
          <div className="cathero__card cathero__card--mid">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logoMuted} alt="" className="cathero__logo" style={{ width: 36, height: 36, opacity: 0.85 }} />
              <span className="cathero__label" style={{ fontSize: 11, color: "#7f93ab" }}>Carte cadeau</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span className="cathero__denom" style={{ fontSize: 38 }}>{brand.denoms[1]}</span>
              <span className="cathero__unit" style={{ fontSize: 16 }}>{brand.unit}</span>
            </div>
          </div>

          {/* front card */}
          <div className="cathero__card cathero__card--front">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logo} alt={brand.name} className="cathero__logo" style={{ width: 40, height: 40 }} />
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.02em" }}>{brand.name}</span>
              </div>
              <span className="cathero__label" style={{ fontSize: 11, color: "var(--accent)" }}>Code digital</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span className="cathero__denom" style={{ fontSize: 44 }}>{brand.denoms[0]}</span>
                <span className="cathero__unit" style={{ fontSize: 17 }}>{brand.unit}</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Livré par e-mail</span>
            </div>
          </div>
        </div>
      )}

      <div className="cathero__fade" aria-hidden />

      <div className="cathero__content">
        <div className="cathero__badge">
          <span className="cathero__badge-dot" />
          <span className="cathero__badge-text">{badge}</span>
        </div>

        <h1 className="cathero__h1">{headline}</h1>

        {subcopy && <p className="cathero__sub">{subcopy}</p>}

        <div className="cathero__ctas">
          <Link href={primaryHref} className="cathero__cta-primary">
            {primaryLabel}
            <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>→</span>
          </Link>
          <Link href={secondaryHref} className="cathero__cta-secondary">
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
