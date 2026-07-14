import type { InfoIconKey } from "@/lib/categoryLanding";

/**
 * "Customer Trust & Conversion" content model.
 *
 * All copy for the trust experience (Why ghost.ma, reviews, Navigator tips,
 * delivery flow, FAQ, trust strip) lives here as plain data so it can be
 * persisted in the existing store-settings CMS (`StoreSettings.trust`) and
 * edited from admin later — no new database tables are required for launch.
 * The reviews shape intentionally mirrors a future `Review` row (verified
 * flag, moderation status, region, product, photos) so seeded demo reviews can
 * be swapped for real, admin-moderated reviews with no component changes.
 *
 * Icons reuse the approved `InfoIconKey` set (see categoryIcons.tsx) — no
 * arbitrary SVG is ever accepted, keeping storefront rendering safe.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhyGhostCard = {
  id: string;
  icon: InfoIconKey;
  title: string;
  description: string;
  enabled: boolean;
};

/** Moderation status — "approved" shows, "hidden" is retained but not rendered.
 *  Ready for a future admin moderation queue. */
export type ReviewStatus = "approved" | "hidden";

export type DemoReview = {
  id: string;
  /** Reviewer first name only (privacy-friendly, matches real-review plan). */
  name: string;
  /** Region label, e.g. "Casablanca" or "Maroc". */
  region: string;
  /** Product purchased, free text. */
  product: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** 1–5 stars. */
  rating: number;
  text: string;
  /** Optional product image URL (future: customer photos[]). */
  productImage?: string;
  /** Verified purchase badge. Demo reviews set this to true. */
  verified: boolean;
  status: ReviewStatus;
};

export type ReviewsContent = {
  /** True while the list is seeded demo data — surfaces a small notice and is
   *  the single flag admin flips once real reviews replace the seed. */
  isDemo: boolean;
  reviews: DemoReview[];
};

export type DeliveryStep = {
  id: string;
  icon: InfoIconKey;
  title: string;
  description: string;
};

export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
};

export type FaqCategory = {
  id: string;
  label: string;
  entries: FaqEntry[];
};

/** A contextual Navigator tip and the tokens that trigger it. Matching is done
 *  against lowercased context tokens (product name, category slug, explicit
 *  keys). `always` tips (e.g. general delivery reminder) show in every
 *  context. */
export type TipType = "information" | "compatibility" | "warning" | "security";

export type NavigatorTipRule = {
  id: string;
  type: TipType;
  title: string;
  message: string;
  /** Lowercase substrings; if any is found in the context the tip shows. */
  match: string[];
  /** Always show regardless of context (general tips). */
  always?: boolean;
  enabled: boolean;
};

export type TrustContent = {
  whyGhost: WhyGhostCard[];
  reviews: ReviewsContent;
  navigatorTips: NavigatorTipRule[];
  deliverySteps: DeliveryStep[];
  faq: FaqCategory[];
  /** Short ✓ items for the reusable trust strip. */
  trustStrip: string[];
};

// ---------------------------------------------------------------------------
// Defaults (French — matches the ghost.ma storefront voice)
// ---------------------------------------------------------------------------

export const defaultTrustContent: TrustContent = {
  whyGhost: [
    {
      id: "official",
      icon: "shield",
      title: "Produits 100% officiels",
      description:
        "Cartes cadeaux, licences et abonnements provenant de sources officielles. Aucun code douteux, jamais.",
      enabled: true,
    },
    {
      id: "local-payment",
      icon: "card",
      title: "Paiement marocain",
      description:
        "Virement bancaire, USDT ou PayPal. Payez en toute confiance avec les méthodes qui vous conviennent.",
      enabled: true,
    },
    {
      id: "region-guidance",
      icon: "globe",
      title: "Guidage par région",
      description:
        "Le Navigator vous indique la bonne région avant l'achat pour éviter tout code incompatible.",
      enabled: true,
    },
    {
      id: "fast-delivery",
      icon: "bolt",
      title: "Livraison numérique rapide",
      description:
        "Votre produit est délivré dès la confirmation du paiement, directement sur votre page de suivi.",
      enabled: true,
    },
    {
      id: "human-support",
      icon: "support",
      title: "Support humain, au Maroc",
      description:
        "Une équipe locale disponible en français et en arabe, par e-mail et WhatsApp.",
      enabled: true,
    },
    {
      id: "secure",
      icon: "lock",
      title: "Achat sécurisé",
      description:
        "Chaque paiement est vérifié avant livraison. Vos données et votre commande restent protégées.",
      enabled: true,
    },
  ],
  reviews: {
    isDemo: true,
    reviews: [
      {
        id: "r1",
        name: "Youssef",
        region: "Casablanca",
        product: "Carte Steam 50 $",
        date: "2026-06-28",
        rating: 5,
        text: "Code reçu quelques minutes après la confirmation du virement. Tout a fonctionné du premier coup.",
        verified: true,
        status: "approved",
      },
      {
        id: "r2",
        name: "Salma",
        region: "Rabat",
        product: "PlayStation Store 100 $",
        date: "2026-06-21",
        rating: 5,
        text: "J'avais peur pour la région mais le Navigator m'a bien guidée. Carte parfaitement compatible.",
        verified: true,
        status: "approved",
      },
      {
        id: "r3",
        name: "Anas",
        region: "Marrakech",
        product: "Abonnement Netflix",
        date: "2026-06-15",
        rating: 4,
        text: "Bon service et support réactif sur WhatsApp quand j'avais une question sur mon abonnement.",
        verified: true,
        status: "approved",
      },
      {
        id: "r4",
        name: "Imane",
        region: "Tanger",
        product: "Xbox Game Pass",
        date: "2026-06-09",
        rating: 5,
        text: "Prix clair, paiement en USDT sans problème, livraison immédiate. Je recommande.",
        verified: true,
        status: "approved",
      },
      {
        id: "r5",
        name: "Mehdi",
        region: "Fès",
        product: "Carte Valorant",
        date: "2026-05-30",
        rating: 5,
        text: "Deuxième achat, aussi fluide que le premier. Les codes sont toujours officiels.",
        verified: true,
        status: "approved",
      },
      {
        id: "r6",
        name: "Khadija",
        region: "Agadir",
        product: "Roblox 10 $",
        date: "2026-05-22",
        rating: 4,
        text: "Achat pour mon fils, tout s'est bien passé. La page de suivi est très claire.",
        verified: true,
        status: "approved",
      },
    ],
  },
  navigatorTips: [
    {
      id: "playstation",
      type: "compatibility",
      title: "Région du compte PlayStation",
      message:
        "La région de votre compte PlayStation doit correspondre à la région de la carte cadeau, sinon le code ne pourra pas être utilisé.",
      match: ["playstation", "psn", "ps4", "ps5", "sony"],
      enabled: true,
    },
    {
      id: "steam",
      type: "compatibility",
      title: "Codes Steam Wallet",
      message:
        "Les codes Steam Wallet sont spécifiques à une région. Vérifiez la région de votre compte Steam avant l'achat.",
      match: ["steam", "valve"],
      enabled: true,
    },
    {
      id: "netflix",
      type: "information",
      title: "Région de l'abonnement",
      message:
        "Vérifiez la région de votre abonnement avant l'achat pour vous assurer de sa compatibilité.",
      match: ["netflix", "spotify", "abonnement"],
      enabled: true,
    },
    {
      id: "general-delivery",
      type: "security",
      title: "Livraison après paiement",
      message:
        "Les produits numériques sont délivrés après confirmation du paiement, directement sur votre page de suivi.",
      match: [],
      always: true,
      enabled: true,
    },
  ],
  deliverySteps: [
    {
      id: "choose",
      icon: "sparkle",
      title: "Choisissez votre produit",
      description: "Sélectionnez le produit et la quantité qui vous conviennent.",
    },
    {
      id: "pay",
      icon: "card",
      title: "Effectuez le paiement",
      description: "Réglez avec la méthode marocaine de votre choix.",
    },
    {
      id: "verify",
      icon: "shield",
      title: "Vérification du paiement",
      description: "Nous confirmons rapidement votre paiement avant la livraison.",
    },
    {
      id: "deliver",
      icon: "bolt",
      title: "Livraison numérique",
      description: "Votre produit apparaît sur votre page de suivi et par e-mail.",
    },
    {
      id: "redeem",
      icon: "check",
      title: "Utilisez votre code",
      description: "Suivez le guide de région pour activer votre produit sans souci.",
    },
  ],
  faq: [
    {
      id: "avant-achat",
      label: "Avant l'achat",
      entries: [
        {
          id: "quelle-region",
          question: "Quelle région dois-je choisir ?",
          answer:
            "Choisissez la région qui correspond à celle de votre compte (PlayStation, Steam, Xbox, etc.). Le Navigator affiche un rappel de compatibilité sur les produits concernés. En cas de doute, contactez le support avant d'acheter.",
        },
        {
          id: "acheter-pour-autrui",
          question: "Puis-je acheter pour quelqu'un d'autre ?",
          answer:
            "Oui. Le code numérique n'est lié à aucune identité : vous pouvez l'offrir. Assurez-vous simplement que la région du produit correspond au compte de la personne qui l'utilisera.",
        },
      ],
    },
    {
      id: "paiements",
      label: "Paiements",
      entries: [
        {
          id: "moyens-paiement",
          question: "Quels moyens de paiement acceptez-vous ?",
          answer:
            "Nous acceptons le virement bancaire, l'USDT et PayPal. Les méthodes disponibles s'affichent automatiquement à l'étape de paiement — seules les méthodes actives vous sont proposées.",
        },
        {
          id: "changer-paiement",
          question: "Puis-je changer de méthode de paiement ?",
          answer:
            "Tant que le paiement n'est pas confirmé, vous pouvez changer de méthode depuis la page de paiement de votre commande.",
        },
      ],
    },
    {
      id: "livraison",
      label: "Livraison",
      entries: [
        {
          id: "delai-livraison",
          question: "Combien de temps prend la livraison ?",
          answer:
            "La livraison est numérique. Dès que votre paiement est confirmé, votre produit apparaît sur votre page de suivi et vous est envoyé par e-mail — généralement en quelques minutes.",
        },
        {
          id: "recevoir-code",
          question: "Comment vais-je recevoir mon code ?",
          answer:
            "Votre code s'affiche sur la page de suivi de votre commande et est envoyé à l'adresse e-mail utilisée lors de l'achat. Gardez ce lien de suivi : votre commande y reste accessible.",
        },
      ],
    },
    {
      id: "comptes-regions",
      label: "Comptes & régions",
      entries: [
        {
          id: "code-ne-marche-pas",
          question: "Que faire si mon code ne fonctionne pas ?",
          answer:
            "Dans la grande majorité des cas, il s'agit d'une région incompatible. Vérifiez la région de votre compte, puis contactez le support avec votre numéro de commande : nous vous aidons rapidement.",
        },
      ],
    },
    {
      id: "remboursements",
      label: "Remboursements",
      entries: [
        {
          id: "remboursements",
          question: "Comment fonctionnent les remboursements ?",
          answer:
            "Avant livraison, une commande non payée ou non délivrée peut être annulée. Après révélation d'un code, un remboursement reste possible en cas d'erreur avérée, de doublon ou de code invalide. Consultez notre politique de remboursement pour le détail.",
        },
      ],
    },
    {
      id: "support",
      label: "Support",
      entries: [
        {
          id: "contacter-support",
          question: "Puis-je contacter le support ?",
          answer:
            "Oui, une équipe locale vous répond en français et en arabe par e-mail et WhatsApp. Indiquez votre numéro de commande et l'e-mail utilisé pour un traitement plus rapide.",
        },
      ],
    },
  ],
  trustStrip: [
    "Produits numériques officiels",
    "Paiements sécurisés",
    "Support marocain local",
    "Livraison rapide",
    "Prix transparents",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Merge a persisted (possibly partial or older) trust blob over the defaults.
 * Follows the same defensive convention as `mergeStoreSettings`: arrays are
 * taken wholesale when present and well-formed, otherwise the default is kept,
 * so a malformed admin save can never blank out the trust experience.
 */
export function mergeTrustContent(value: unknown): TrustContent {
  if (!isObject(value)) return defaultTrustContent;
  const reviews = isObject(value.reviews) ? value.reviews : {};
  return {
    whyGhost: Array.isArray(value.whyGhost) && value.whyGhost.length > 0
      ? (value.whyGhost as WhyGhostCard[])
      : defaultTrustContent.whyGhost,
    reviews: {
      isDemo:
        typeof reviews.isDemo === "boolean"
          ? reviews.isDemo
          : defaultTrustContent.reviews.isDemo,
      reviews: Array.isArray(reviews.reviews)
        ? (reviews.reviews as DemoReview[])
        : defaultTrustContent.reviews.reviews,
    },
    navigatorTips: Array.isArray(value.navigatorTips) && value.navigatorTips.length > 0
      ? (value.navigatorTips as NavigatorTipRule[])
      : defaultTrustContent.navigatorTips,
    deliverySteps: Array.isArray(value.deliverySteps) && value.deliverySteps.length > 0
      ? (value.deliverySteps as DeliveryStep[])
      : defaultTrustContent.deliverySteps,
    faq: Array.isArray(value.faq) && value.faq.length > 0
      ? (value.faq as FaqCategory[])
      : defaultTrustContent.faq,
    trustStrip: Array.isArray(value.trustStrip) && value.trustStrip.length > 0
      ? value.trustStrip.filter((s): s is string => typeof s === "string")
      : defaultTrustContent.trustStrip,
  };
}

/** Visible (approved) reviews only. */
export function approvedReviews(content: ReviewsContent): DemoReview[] {
  return content.reviews.filter((r) => r.status === "approved");
}

/** Aggregate rating for the approved reviews. */
export function reviewStats(content: ReviewsContent): {
  count: number;
  average: number;
} {
  const list = approvedReviews(content);
  if (list.length === 0) return { count: 0, average: 0 };
  const sum = list.reduce((total, r) => total + (Number(r.rating) || 0), 0);
  return { count: list.length, average: sum / list.length };
}

/**
 * Resolve the Navigator tips that apply to a given context. `context` is any
 * mix of free text (product name, category slug, brand) — it is lowercased and
 * each rule matches if it is `always` or any of its `match` tokens appears in
 * the joined context. Order is preserved (contextual first, general last is up
 * to the caller's rule ordering).
 */
export function resolveNavigatorTips(
  rules: NavigatorTipRule[],
  context: string | Array<string | null | undefined> = [],
): NavigatorTipRule[] {
  const haystack = (Array.isArray(context) ? context : [context])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.always) return true;
    return rule.match.some((token) => token && haystack.includes(token.toLowerCase()));
  });
}
