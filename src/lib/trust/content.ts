import type { InfoIconKey } from "@/lib/categoryLanding";
import type { NavigatorTip, NavigatorTipType } from "@/lib/categoryLanding";

/**
 * Static content for the "Customer Trust & Conversion" system. This is the
 * single source of truth for the reusable trust components (Why Ghost, trust
 * badges, delivery steps, Navigator context tips).
 *
 * ADMIN-READY ARCHITECTURE: every dataset here is a plain, typed array shaped so
 * it can later be backed by the store-settings CMS (see `src/lib/storeSettings`)
 * or a dedicated Prisma model without touching the components — the components
 * only depend on these types, never on where the data comes from. Until an admin
 * surface exists, these curated defaults render. They are intentionally concrete
 * (no marketing clichés) and written in French to match the storefront.
 */

// ---------------------------------------------------------------------------
// Why Ghost.ma — concrete advantages
// ---------------------------------------------------------------------------

export type TrustAdvantage = {
  id: string;
  /** Icon key from the shared category icon set (categoryIcons.tsx). */
  icon: InfoIconKey;
  title: string;
  description: string;
};

export const WHY_GHOST_ADVANTAGES: TrustAdvantage[] = [
  {
    id: "official",
    icon: "shield",
    title: "Produits numériques officiels",
    description:
      "Codes et cartes authentiques, approvisionnés auprès de sources officielles — jamais de clés douteuses.",
  },
  {
    id: "payments",
    icon: "card",
    title: "Paiements marocains",
    description:
      "Virement bancaire, USDT et PayPal. Payez avec la méthode qui vous convient, sans carte étrangère.",
  },
  {
    id: "regions",
    icon: "globe",
    title: "Choix de région clair",
    description:
      "On vous indique la région à choisir avant l'achat, pour que votre code fonctionne du premier coup.",
  },
  {
    id: "delivery",
    icon: "bolt",
    title: "Livraison numérique rapide",
    description:
      "Votre produit est envoyé par e-mail et disponible dans votre compte dès la confirmation du paiement.",
  },
  {
    id: "support",
    icon: "support",
    title: "Support humain",
    description:
      "Une équipe locale, joignable en français et en darija, qui répond avant et après votre achat.",
  },
  {
    id: "secure",
    icon: "lock",
    title: "Achat 100% sécurisé",
    description:
      "Paiement vérifié manuellement et données protégées. Aucune information sensible n'est stockée.",
  },
];

// ---------------------------------------------------------------------------
// Trust strip — short reassurance badges (reusable across the site)
// ---------------------------------------------------------------------------

export type TrustBadge = { id: string; label: string };

export const TRUST_BADGES: TrustBadge[] = [
  { id: "official", label: "Produits numériques officiels" },
  { id: "secure", label: "Paiements sécurisés" },
  { id: "support", label: "Support marocain local" },
  { id: "delivery", label: "Livraison rapide" },
  { id: "pricing", label: "Prix transparents" },
];

// ---------------------------------------------------------------------------
// Delivery — how it works (reusable on the homepage and product pages)
// ---------------------------------------------------------------------------

export type DeliveryStep = { id: string; title: string; text: string };

export const DELIVERY_STEPS: DeliveryStep[] = [
  {
    id: "choose",
    title: "Choisissez votre produit",
    text: "Sélectionnez le produit, la région et le montant qui vous conviennent.",
  },
  {
    id: "pay",
    title: "Effectuez le paiement",
    text: "Réglez avec un mode de paiement disponible (virement, USDT ou PayPal).",
  },
  {
    id: "verify",
    title: "Vérification du paiement",
    text: "Notre équipe confirme la réception de votre paiement.",
  },
  {
    id: "deliver",
    title: "Livraison numérique",
    text: "Votre code est envoyé par e-mail et apparaît dans votre compte.",
  },
  {
    id: "redeem",
    title: "Utilisez votre code",
    text: "Rechargez votre compte ou activez votre abonnement, et profitez-en.",
  },
];

// ---------------------------------------------------------------------------
// Navigator tips — context-aware guidance
// ---------------------------------------------------------------------------

/**
 * A Navigator tip keyed by a context slug. Matching is keyword-based against a
 * free-form context string (a category slug/name, a product name, etc.) so the
 * same map serves category pages, product pages and campaign pages. `keywords`
 * is lower-cased on match.
 *
 * The rendered shape is the existing `NavigatorTip` data type, so the tip reuses
 * the category `NavigatorTip` component verbatim — no new visual idiom.
 */
export type ContextTip = {
  id: string;
  /** Lower-case substrings that, if present in the context, select this tip. */
  keywords: string[];
  type: NavigatorTipType;
  title: string;
  message: string;
};

export const CONTEXT_TIPS: ContextTip[] = [
  {
    id: "playstation",
    keywords: ["playstation", "psn", "ps4", "ps5", "ps plus", "ps-plus"],
    type: "compatibility",
    title: "Vérifiez la région PlayStation",
    message:
      "La région de votre compte PlayStation doit correspondre à celle de la carte cadeau, sinon le code ne pourra pas être utilisé.",
  },
  {
    id: "steam",
    keywords: ["steam"],
    type: "compatibility",
    title: "Codes Steam régionaux",
    message:
      "Les codes Steam Wallet sont spécifiques à une région. Choisissez la région correspondant à votre compte Steam.",
  },
  {
    id: "netflix",
    keywords: ["netflix"],
    type: "information",
    title: "Abonnement Netflix",
    message:
      "Vérifiez la région de votre abonnement avant l'achat pour que la recharge s'applique correctement.",
  },
  {
    id: "xbox",
    keywords: ["xbox", "game pass", "microsoft"],
    type: "compatibility",
    title: "Vérifiez la région Xbox",
    message:
      "La région de votre compte Xbox / Microsoft doit correspondre à celle de la carte pour que le code fonctionne.",
  },
];

/** The always-safe fallback tip when no context keyword matches. */
export const GENERAL_TIP: ContextTip = {
  id: "general",
  keywords: [],
  type: "information",
  title: "Livraison des produits numériques",
  message:
    "Les produits numériques sont livrés après confirmation du paiement. Votre code arrive par e-mail et reste disponible dans votre compte.",
};

/**
 * Resolve the Navigator tips to show for a given context. Returns matching
 * context tips (deduped, in map order); when nothing matches and `fallback` is
 * true, returns the general tip so there is always helpful guidance.
 */
export function resolveContextTips(
  context: string | Array<string | null | undefined> | null | undefined,
  { fallback = true }: { fallback?: boolean } = {},
): ContextTip[] {
  const haystack = (Array.isArray(context)
    ? context.filter(Boolean).join(" ")
    : context ?? "")
    .toLowerCase()
    .trim();
  const matches = haystack
    ? CONTEXT_TIPS.filter((tip) =>
        tip.keywords.some((keyword) => haystack.includes(keyword)),
      )
    : [];
  if (matches.length > 0) return matches;
  return fallback ? [GENERAL_TIP] : [];
}

/** Adapt a ContextTip to the `NavigatorTip` data shape used by the renderer. */
export function contextTipToNavigatorTip(tip: ContextTip): NavigatorTip {
  return {
    enabled: true,
    title: tip.title,
    message: tip.message,
    type: tip.type,
    ctaLabel: "",
    ctaUrl: "",
  };
}

// ---------------------------------------------------------------------------
// Analytics event names — one place so components never drift
// ---------------------------------------------------------------------------

export const TRUST_EVENTS = {
  trustViewed: "trust_section_viewed",
  whyViewed: "why_ghost_viewed",
  deliveryViewed: "delivery_section_viewed",
  paymentsViewed: "payment_methods_viewed",
  tipViewed: "navigator_tip_viewed",
  reviewsViewed: "reviews_viewed",
  reviewInteraction: "review_interaction",
  faqViewed: "faq_viewed",
  faqOpen: "faq_open",
  faqSearch: "faq_search",
} as const;
