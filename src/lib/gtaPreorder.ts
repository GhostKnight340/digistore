/**
 * GTA VI pre-order campaign — central, typed configuration.
 *
 * The whole landing page at `/precommande-gta-6` is driven by ONE typed config
 * object here. There is no dedicated campaign Prisma model, and building a
 * general-purpose CMS for a single page would be over-engineering, so — exactly
 * as the task allows — all editable content lives in this one file: active
 * state, hero copy, release date, the PlayStation / Xbox recommended-product
 * slugs, FAQ, disclosure, SEO and the social image.
 *
 * Recommended products are NOT hardcoded. Each platform points at a catalogue
 * brand/category (`brandKey`, e.g. "playstation" / "xbox"); the page resolves
 * that brand's REAL gift-card products live through the normal catalogue layer,
 * so the section always shows whatever PSN / Xbox cards actually exist on the
 * site — no price, media, region or stock is ever copied here, and inactive
 * products simply disappear.
 *
 * This module is intentionally client-safe (no `server-only`) — the same types
 * and pure helpers are shared by the server page, the client widgets and the
 * tests, mirroring how `categoryLanding.ts` is structured.
 */

import type { NavigatorTip } from "./categoryLanding";

export type GtaPlatform = "playstation" | "xbox";

export const GTA_PLATFORMS: GtaPlatform[] = ["playstation", "xbox"];

/** Campaign identifier sent (as a non-PII param) with every analytics event. */
export const GTA_CAMPAIGN_ID = "gta-vi-preorder";

/** Stable public route for the landing page. */
export const GTA_PREORDER_PATH = "/precommande-gta-6";

/**
 * Official launch: 19 November 2026, anchored to the Ghost.ma business timezone
 * (Africa/Casablanca, UTC+1, no DST) so the countdown is identical for every
 * visitor regardless of their own clock. The only confirmed date — never a
 * speculative edition/price/bonus date.
 */
export const GTA_RELEASE_ISO = "2026-11-19T00:00:00+01:00";

const MS_PER_DAY = 86_400_000;

/** The release instant as a Date. */
export function gtaReleaseDate(): Date {
  return new Date(GTA_RELEASE_ISO);
}

/** True once the official release instant has passed (drives graceful countdown
 *  removal after launch). */
export function isReleased(now: Date): boolean {
  return now.getTime() >= gtaReleaseDate().getTime();
}

/** Whole days remaining until release (0 on/after release day). Used for the
 *  server-rendered, accessible countdown fallback. */
export function daysUntilRelease(now: Date): number {
  const diff = gtaReleaseDate().getTime() - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

/** Coerce an arbitrary `?platform=` value to a known platform, or null. */
export function parsePlatform(value: unknown): GtaPlatform | null {
  return GTA_PLATFORMS.includes(value as GtaPlatform)
    ? (value as GtaPlatform)
    : null;
}

export interface GtaFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface GtaHowItWorksStep {
  n: string;
  title: string;
  text: string;
}

export interface GtaPlatformConfig {
  key: GtaPlatform;
  /** Short selectable-card label, e.g. "PlayStation 5". */
  label: string;
  /** Official store the customer finalises the pre-order on. */
  storeName: string;
  /** Selectable-card supporting copy. */
  description: string;
  /**
   * Catalogue brand key holding this platform's gift cards. Matched (via
   * `canonicalBrandKey`) against the live categories, so the recommended cards
   * are the real PSN / Xbox gift-card products already on the site rather than a
   * fixed list of slugs.
   */
  brandKey: string;
}

export interface GtaDisclosure {
  body: string;
  points: string[];
  refundHref: string;
  supportHref: string;
  compatibilityHref: string;
}

export interface GtaSeo {
  title: string;
  description: string;
  canonicalPath: string;
  ogImageUrl: string;
}

export interface GtaHero {
  eyebrow: string;
  heading: string;
  subheading: string;
  releaseLine: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  /** Approved hero artwork URL. Empty → the branded typographic layout is used
   *  (no invented game artwork). */
  heroImageUrl: string;
}

export interface GtaReleaseInfo {
  dateLabel: string;
  platforms: string[];
  availabilityLabel: string;
}

export interface GtaPreorderConfig {
  /** Page active/inactive. When false the route 404s. */
  active: boolean;
  campaignId: string;
  releaseIso: string;
  hero: GtaHero;
  releaseInfo: GtaReleaseInfo;
  platforms: Record<GtaPlatform, GtaPlatformConfig>;
  navigatorTip: NavigatorTip;
  howItWorks: GtaHowItWorksStep[];
  disclosure: GtaDisclosure;
  faq: GtaFaqItem[];
  /** Catalogue brand keys whose real products fill the "Produits associés"
   *  strip (resolved live; only active/public ones render). */
  relatedBrandKeys: string[];
  seo: GtaSeo;
  /** Restrained trademark disclaimer. */
  trademark: string;
}

/**
 * THE editable content. Every value here is intentionally centralised so a
 * launch does not require touching the page or component code. Product slugs
 * are the real catalogue slugs (see src/lib/products.ts / the live DB).
 */
export const gtaPreorderConfig: GtaPreorderConfig = {
  active: true,
  campaignId: GTA_CAMPAIGN_ID,
  releaseIso: GTA_RELEASE_ISO,
  hero: {
    eyebrow: "PRÉCOMMANDE GTA VI",
    heading:
      "Précommandez GTA VI avec une carte cadeau PlayStation ou Xbox",
    subheading:
      "Ajoutez le crédit nécessaire à votre compte, puis précommandez Grand Theft Auto VI directement depuis la boutique officielle de votre console.",
    releaseLine: "Sortie officielle : 19 novembre 2026",
    primaryCtaLabel: "Choisir ma plateforme",
    secondaryCtaLabel: "Comment ça marche",
    heroImageUrl: "",
  },
  releaseInfo: {
    dateLabel: "19 novembre 2026",
    platforms: ["PlayStation 5", "Xbox Series X|S"],
    availabilityLabel: "Précommande disponible sur les boutiques officielles",
  },
  platforms: {
    playstation: {
      key: "playstation",
      label: "PlayStation 5",
      storeName: "PlayStation Store",
      description:
        "Précommandez depuis le PlayStation Store avec une carte cadeau compatible avec la région de votre compte.",
      brandKey: "playstation",
    },
    xbox: {
      key: "xbox",
      label: "Xbox Series X|S",
      storeName: "Microsoft Store",
      description:
        "Précommandez depuis le Microsoft Store de votre console avec une carte cadeau Xbox compatible.",
      brandKey: "xbox",
    },
  },
  navigatorTip: {
    enabled: true,
    title: "À vérifier avant l’achat",
    message:
      "La région de la carte cadeau doit correspondre à la région de votre compte PlayStation ou Xbox. Une carte d’une autre région peut être refusée. Vérifiez également le prix de l’édition souhaitée dans la boutique officielle avant de choisir le montant de votre carte.",
    type: "compatibility",
    ctaLabel: "",
    ctaUrl: "",
  },
  howItWorks: [
    {
      n: "01",
      title: "Choisissez votre plateforme",
      text: "Sélectionnez PlayStation 5 ou Xbox Series X|S.",
    },
    {
      n: "02",
      title: "Achetez une carte compatible",
      text: "Choisissez une carte cadeau correspondant à la région et au montant nécessaires.",
    },
    {
      n: "03",
      title: "Ajoutez le crédit à votre compte",
      text: "Utilisez le code sur la boutique officielle de votre console.",
    },
    {
      n: "04",
      title: "Précommandez GTA VI",
      text: "Finalisez la précommande directement sur le PlayStation Store ou le Microsoft Store.",
    },
  ],
  disclosure: {
    body:
      "Ghost.ma vend des cartes cadeaux numériques. L’achat d’une carte sur Ghost.ma ne constitue pas l’achat direct de GTA VI et ne réserve pas automatiquement le jeu. La précommande doit être finalisée séparément sur la boutique officielle PlayStation ou Xbox.",
    points: [
      "Les cartes cadeaux sont soumises à la compatibilité de région.",
      "Vérifiez le solde requis dans la boutique officielle avant d’acheter votre carte.",
      "Les règles de remboursement des produits numériques s’appliquent selon la politique en vigueur de Ghost.ma.",
    ],
    refundHref: "/refunds",
    supportHref: "/support",
    compatibilityHref: "/support",
  },
  faq: [
    {
      id: "vend-directement",
      question: "Est-ce que Ghost.ma vend GTA VI directement ?",
      answer:
        "Non. Ghost.ma vend les cartes cadeaux permettant d’ajouter du crédit à votre compte. La précommande du jeu se fait ensuite sur la boutique officielle de votre console.",
    },
    {
      id: "consoles",
      question: "Sur quelles consoles GTA VI sera-t-il disponible au lancement ?",
      answer: "PlayStation 5 et Xbox Series X|S.",
    },
    {
      id: "quelle-carte",
      question: "Quelle carte cadeau dois-je choisir ?",
      answer:
        "Choisissez une carte compatible avec la région de votre compte et vérifiez le prix de l’édition souhaitée dans votre boutique officielle.",
    },
    {
      id: "region-croisee",
      question: "Puis-je utiliser une carte PlayStation France sur un compte américain ?",
      answer:
        "Non. Les cartes cadeaux sont généralement limitées à leur région.",
    },
    {
      id: "auto-precommande",
      question: "Est-ce que la carte précommande automatiquement GTA VI ?",
      answer:
        "Non. Après avoir ajouté le crédit, vous devez finaliser la précommande sur la boutique officielle.",
    },
    {
      id: "plusieurs-cartes",
      question: "Puis-je acheter plusieurs cartes si une seule ne suffit pas ?",
      answer:
        "Oui, lorsque la boutique de votre console permet de cumuler le solde, sous réserve des règles du compte et de la région.",
    },
  ],
  relatedBrandKeys: ["playstation", "xbox"],
  seo: {
    title:
      "Précommander GTA VI au Maroc avec une carte PSN ou Xbox | Ghost.ma",
    description:
      "Préparez votre précommande de GTA VI sur PS5 ou Xbox Series X|S avec une carte cadeau compatible. Sortie officielle le 19 novembre 2026.",
    canonicalPath: GTA_PREORDER_PATH,
    ogImageUrl: "",
  },
  trademark:
    "Grand Theft Auto, GTA and related marks are trademarks of Take-Two Interactive Software, Inc. Ghost.ma is not affiliated with or endorsed by Rockstar Games, Sony Interactive Entertainment or Microsoft.",
};

/** All catalogue brand keys referenced anywhere in the config (recommended per
 *  platform + related) — the set of brands the page resolves live. */
export function referencedBrandKeys(
  config: GtaPreorderConfig = gtaPreorderConfig,
): string[] {
  const keys = new Set<string>();
  for (const platform of GTA_PLATFORMS) {
    keys.add(config.platforms[platform].brandKey);
  }
  for (const key of config.relatedBrandKeys) keys.add(key);
  return [...keys];
}

/** FAQ mapped to the shared CategoryFaq item shape (active/ordered). */
export function gtaFaqItems(config: GtaPreorderConfig = gtaPreorderConfig) {
  return config.faq.map((item, index) => ({
    id: item.id,
    question: item.question,
    answer: item.answer,
    active: true,
    sortOrder: index,
  }));
}
