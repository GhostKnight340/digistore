/**
 * Central content source for the Customer Trust & Conversion system.
 *
 * Everything here is plain, typed data with sensible French defaults so the
 * trust components can be dropped onto the homepage, product pages, collection
 * pages and campaign pages without prop drilling. Each block is intentionally
 * shaped like the existing `storeSettings` content (arrays of `{ id, ... }`
 * records) so a future admin editor can persist overrides in `StoreSettings`
 * or the database and merge them the same way `mergeStoreSettings` does — no
 * component change required. Until then these constants are the single source
 * of truth, so copy only ever lives in one place.
 *
 * Do NOT hardcode payment methods here — those always come from the live
 * payment configuration (see AcceptedPayments).
 */

// ----------------------------------------------------------------------------
// Why ghost.ma — concrete advantages, not marketing clichés.
// ----------------------------------------------------------------------------

/** Icon keys map to line icons drawn in the component (never recolored art). */
export type TrustIconKey =
  | "official"
  | "payment"
  | "region"
  | "delivery"
  | "support"
  | "secure";

export interface WhyGhostItem {
  id: string;
  icon: TrustIconKey;
  title: string;
  description: string;
}

export const WHY_GHOST_ITEMS: WhyGhostItem[] = [
  {
    id: "official",
    icon: "official",
    title: "Produits numériques officiels",
    description:
      "Cartes cadeaux, licences et abonnements issus de sources officielles — jamais de codes douteux ou revendus.",
  },
  {
    id: "payment",
    icon: "payment",
    title: "Paiement marocain",
    description:
      "Virement bancaire, USDT et PayPal. Payez en dirhams avec les méthodes que vous utilisez déjà au Maroc.",
  },
  {
    id: "region",
    icon: "region",
    title: "Guidage clair des régions",
    description:
      "Chaque produit indique sa région et sa compatibilité, pour choisir le bon code du premier coup.",
  },
  {
    id: "delivery",
    icon: "delivery",
    title: "Livraison numérique rapide",
    description:
      "Votre code est disponible sur votre page de suivi dès la confirmation du paiement.",
  },
  {
    id: "support",
    icon: "support",
    title: "Support humain local",
    description:
      "Une équipe basée au Maroc, joignable en français et en arabe, qui connaît vos plateformes.",
  },
  {
    id: "secure",
    icon: "secure",
    title: "Achat sécurisé",
    description:
      "Vérification du paiement avant livraison et suivi de commande protégé de bout en bout.",
  },
];

// ----------------------------------------------------------------------------
// How delivery works — the same flow used on the homepage and product pages.
// ----------------------------------------------------------------------------

export interface DeliveryStep {
  id: string;
  title: string;
  description: string;
}

export const DELIVERY_STEPS: DeliveryStep[] = [
  {
    id: "choose",
    title: "Choisissez votre produit",
    description: "Sélectionnez le produit, le montant et la région qui vous conviennent.",
  },
  {
    id: "pay",
    title: "Réglez votre commande",
    description: "Choisissez un mode de paiement marocain et finalisez votre achat.",
  },
  {
    id: "verify",
    title: "Vérification du paiement",
    description: "Notre équipe confirme votre paiement, généralement en quelques minutes.",
  },
  {
    id: "deliver",
    title: "Livraison numérique",
    description: "Votre code apparaît sur votre page de suivi et vous est envoyé par e-mail.",
  },
  {
    id: "redeem",
    title: "Activez votre code",
    description: "Suivez la fiche produit pour utiliser votre code sur la bonne plateforme.",
  },
];

// ----------------------------------------------------------------------------
// Navigator contextual tips — reusable, context-keyed.
// ----------------------------------------------------------------------------
//
// A tip is selected by matching one of its `contexts` against the context
// tokens a page passes in (category slug, brand, product tags…). The "general"
// context is always eligible, so every page gets at least one helpful tip
// without ever feeling noisy — see ContextualTips for the pick-one rule.

export type TipTone = "information" | "compatibility" | "warning" | "security";

export interface ContextualTip {
  id: string;
  /** Lowercased tokens this tip applies to. "general" matches every page. */
  contexts: string[];
  tone: TipTone;
  title: string;
  message: string;
}

export const CONTEXTUAL_TIPS: ContextualTip[] = [
  {
    id: "playstation-region",
    contexts: ["playstation", "psn", "ps", "sony"],
    tone: "compatibility",
    title: "Région du compte PlayStation",
    message:
      "La région de votre compte PlayStation doit correspondre à celle de la carte cadeau, sinon le code ne pourra pas être activé.",
  },
  {
    id: "steam-region",
    contexts: ["steam", "valve"],
    tone: "compatibility",
    title: "Codes Steam Wallet",
    message:
      "Les codes Steam Wallet sont liés à une région. Vérifiez la région de votre compte Steam avant d'acheter.",
  },
  {
    id: "netflix-region",
    contexts: ["netflix", "streaming"],
    tone: "information",
    title: "Vérifiez votre région d'abonnement",
    message:
      "Confirmez la région de votre abonnement Netflix avant l'achat pour garantir la compatibilité du code.",
  },
  {
    id: "xbox-region",
    contexts: ["xbox", "microsoft"],
    tone: "compatibility",
    title: "Région du compte Xbox",
    message:
      "Les cartes Xbox sont régionales : la région de votre compte Microsoft doit correspondre à celle de la carte.",
  },
  {
    id: "general-delivery",
    contexts: ["general"],
    tone: "information",
    title: "Livraison après confirmation",
    message:
      "Les produits numériques sont livrés une fois le paiement confirmé. Vous suivez chaque étape depuis votre page de commande.",
  },
];

/**
 * Pick the single most relevant tip for a page. A specific context match wins
 * over the general fallback; ties keep declaration order. Returns null only if
 * even the general tip is absent. Keeping it to one tip is deliberate — the
 * Navigator should feel helpful, never like a wall of notices.
 */
export function pickContextualTip(
  contexts: string[] = [],
  tips: ContextualTip[] = CONTEXTUAL_TIPS,
): ContextualTip | null {
  const tokens = contexts.map((c) => c.toLowerCase().trim()).filter(Boolean);
  const specific = tips.find((tip) =>
    tip.contexts.some((c) => c !== "general" && tokens.includes(c)),
  );
  if (specific) return specific;
  return tips.find((tip) => tip.contexts.includes("general")) ?? null;
}

// ----------------------------------------------------------------------------
// FAQ — categorized, searchable, deep-linkable.
// ----------------------------------------------------------------------------

export interface TrustFaqItem {
  /** Stable slug used for deep links (#faq-<id>) and analytics. */
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const FAQ_CATEGORIES = [
  "Avant l'achat",
  "Paiement",
  "Livraison",
  "Comptes",
  "Régions",
  "Remboursements",
  "Support",
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export const FAQ_ITEMS: TrustFaqItem[] = [
  {
    id: "buy-for-someone",
    category: "Avant l'achat",
    question: "Puis-je acheter pour quelqu'un d'autre ?",
    answer:
      "Oui. Le produit est numérique : une fois livré, vous pouvez transmettre le code à la personne de votre choix. Assurez-vous simplement que la région du produit correspond à son compte.",
  },
  {
    id: "which-product",
    category: "Avant l'achat",
    question: "Comment savoir si un produit me convient ?",
    answer:
      "Chaque fiche produit indique la plateforme, la région et le montant. En cas de doute, notre support local peut vous confirmer le bon choix avant l'achat.",
  },
  {
    id: "change-payment",
    category: "Paiement",
    question: "Puis-je changer de mode de paiement ?",
    answer:
      "Oui, tant que le paiement n'est pas confirmé. Depuis la page de paiement de votre commande, vous pouvez sélectionner une autre méthode disponible.",
  },
  {
    id: "which-methods",
    category: "Paiement",
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Les méthodes actives s'affichent au moment du paiement — virement bancaire, USDT et PayPal notamment. Seules les méthodes disponibles vous sont proposées.",
  },
  {
    id: "delivery-time",
    category: "Livraison",
    question: "Combien de temps prend la livraison ?",
    answer:
      "La livraison est numérique. Dès la confirmation du paiement, votre code apparaît sur votre page de suivi — généralement en quelques minutes après vérification.",
  },
  {
    id: "receive-code",
    category: "Livraison",
    question: "Comment vais-je recevoir mon code ?",
    answer:
      "Votre code s'affiche sur la page de suivi de votre commande et vous est également envoyé par e-mail. Vous pouvez y revenir à tout moment depuis votre compte.",
  },
  {
    id: "buy-for-account",
    category: "Comptes",
    question: "Ai-je besoin d'un compte pour acheter ?",
    answer:
      "Vous pouvez commander avec votre e-mail et suivre votre commande via le lien reçu. Un compte vous permet en plus de retrouver l'historique de vos achats.",
  },
  {
    id: "which-region",
    category: "Régions",
    question: "Quelle région dois-je choisir ?",
    answer:
      "Choisissez la région qui correspond à votre compte de plateforme (PlayStation, Steam, Xbox…). La région du code doit correspondre à celle du compte pour être activée.",
  },
  {
    id: "code-not-working",
    category: "Remboursements",
    question: "Que faire si mon code ne fonctionne pas ?",
    answer:
      "Contactez le support avec votre numéro de commande et l'e-mail utilisé. En cas de code invalide, doublon ou erreur imputable à ghost.ma, nous corrigeons ou remboursons.",
  },
  {
    id: "refunds",
    category: "Remboursements",
    question: "Comment fonctionnent les remboursements ?",
    answer:
      "Avant livraison, une commande non confirmée peut être annulée ou remboursée. Après livraison d'un code, le remboursement est étudié au cas par cas selon notre politique de remboursement.",
  },
  {
    id: "contact-support",
    category: "Support",
    question: "Puis-je contacter le support ?",
    answer:
      "Oui, notre équipe locale est disponible en français et en arabe. Rendez-vous sur la page Support pour ouvrir une demande ou nous écrire directement.",
  },
];
