/**
 * Customer Trust & Conversion content model.
 *
 * All of the trust-experience content (why-choose-us cards, customer reviews,
 * Navigator tips, delivery steps and the FAQ) lives in the single editable
 * `StoreSetting` JSON blob, exactly like `trustItems`/`statItems`. This file
 * owns the item types, the seeded launch defaults and the pure selectors the
 * storefront components use to read them.
 *
 * The reviews here are SEEDED DEMO content, clearly flagged with `seeded: true`.
 * They are designed to be replaced by real, verified reviews after launch —
 * either by editing the settings blob from the admin, or by pointing
 * `visibleReviews()` at a future `Review` table. The `status`/`verified` fields
 * already model moderation (approve/hide) and the verified-purchase badge, so
 * the storefront never has to change when real reviews arrive.
 */

// ── Why Ghost.ma ─────────────────────────────────────────────────────────────
/** Icon key resolved to an inline SVG by the WhyGhost component. */
export type WhyGhostIcon =
  | "official"
  | "payment"
  | "region"
  | "delivery"
  | "support"
  | "secure";

export type WhyGhostItemSetting = {
  id: string;
  icon: WhyGhostIcon;
  title: string;
  description: string;
  enabled: boolean;
};

// ── Customer reviews ─────────────────────────────────────────────────────────
/** Moderation state. Only `approved` reviews are ever shown to customers. */
export type ReviewStatus = "approved" | "pending" | "hidden";

export type ReviewSetting = {
  id: string;
  /** Reviewer first name (never a full name — privacy). */
  name: string;
  /** 1–5 whole stars. */
  rating: number;
  /** Free label for the buyer's region/city, e.g. "Casablanca" or "France". */
  region: string;
  /** Product purchased label, e.g. "Carte Steam 50€". */
  product: string;
  /** ISO date (YYYY-MM-DD) the review was left. */
  date: string;
  text: string;
  /** Optional product/photo image URL (future customer photos). */
  imageUrl?: string;
  /** Verified-purchase badge. */
  verified: boolean;
  /** Moderation status — admin can flip to `hidden`. */
  status: ReviewStatus;
  /** Marks the seeded demo reviews so they can be swapped for real ones. */
  seeded: boolean;
};

// ── Navigator tips ───────────────────────────────────────────────────────────
export type NavigatorTipType =
  | "information"
  | "compatibility"
  | "warning"
  | "security";

export type NavigatorTipSetting = {
  id: string;
  /**
   * Context tokens the tip applies to, matched case-insensitively against the
   * surrounding page (category slug, product name, platform, region…). The
   * special token `general` matches everywhere as a fallback.
   */
  contexts: string[];
  type: NavigatorTipType;
  title: string;
  message: string;
  enabled: boolean;
};

// ── Delivery steps ───────────────────────────────────────────────────────────
export type DeliveryStepSetting = {
  id: string;
  title: string;
  text: string;
  enabled: boolean;
};

// ── FAQ ──────────────────────────────────────────────────────────────────────
export type FaqCategorySetting = {
  id: string;
  label: string;
};

export type FaqItemSetting = {
  id: string;
  /** Matches a `FaqCategorySetting.id`. */
  category: string;
  question: string;
  answer: string;
  enabled: boolean;
};

// ── Seeded launch defaults ───────────────────────────────────────────────────

export const defaultWhyGhost: WhyGhostItemSetting[] = [
  {
    id: "official",
    icon: "official",
    title: "Produits 100 % officiels",
    description:
      "Cartes cadeaux, licences et abonnements provenant de sources officielles. Jamais de codes revendus ou douteux.",
    enabled: true,
  },
  {
    id: "payment",
    icon: "payment",
    title: "Paiements adaptés au Maroc",
    description:
      "Virement bancaire, USDT et PayPal. Payez avec le moyen qui vous convient, en toute simplicité.",
    enabled: true,
  },
  {
    id: "region",
    icon: "region",
    title: "Guidage par région",
    description:
      "Nous indiquons clairement la région de chaque produit pour éviter toute erreur de compatibilité.",
    enabled: true,
  },
  {
    id: "delivery",
    icon: "delivery",
    title: "Livraison numérique rapide",
    description:
      "Votre code est disponible dès la confirmation du paiement, sur votre page de suivi et par e-mail.",
    enabled: true,
  },
  {
    id: "support",
    icon: "support",
    title: "Support humain, local",
    description:
      "Une équipe au Maroc, joignable en français et en arabe, qui répond avant et après votre achat.",
    enabled: true,
  },
  {
    id: "secure",
    icon: "secure",
    title: "Achat sécurisé",
    description:
      "Transactions chiffrées et vérification du paiement avant chaque livraison. Vos données restent protégées.",
    enabled: true,
  },
];

export const defaultReviews: ReviewSetting[] = [
  {
    id: "seed-1",
    name: "Yassine",
    rating: 5,
    region: "Casablanca",
    product: "Carte Steam 50€",
    date: "2026-06-28",
    text: "Commande livrée en quelques minutes après confirmation du virement. Le code a fonctionné du premier coup. Je recommande.",
    verified: true,
    status: "approved",
    seeded: true,
  },
  {
    id: "seed-2",
    name: "Salma",
    rating: 5,
    region: "Rabat",
    product: "PlayStation Store 100 MAD",
    date: "2026-06-20",
    text: "J'avais peur de me tromper de région, mais le Navigateur m'a bien guidée. Tout était clair. Support très réactif sur WhatsApp.",
    verified: true,
    status: "approved",
    seeded: true,
  },
  {
    id: "seed-3",
    name: "Mehdi",
    rating: 4,
    region: "Marrakech",
    product: "Abonnement Xbox Game Pass",
    date: "2026-06-14",
    text: "Bon prix et livraison sérieuse. J'aurais aimé encore plus de moyens de paiement, mais le virement a été validé rapidement.",
    verified: true,
    status: "approved",
    seeded: true,
  },
  {
    id: "seed-4",
    name: "Imane",
    rating: 5,
    region: "Tanger",
    product: "Carte Roblox 100 MAD",
    date: "2026-06-09",
    text: "Parfait pour l'anniversaire de mon petit frère. Achat simple et le code est arrivé par e-mail. Merci !",
    verified: true,
    status: "approved",
    seeded: true,
  },
  {
    id: "seed-5",
    name: "Omar",
    rating: 5,
    region: "Fès",
    product: "Valorant Points",
    date: "2026-05-30",
    text: "Site propre et rassurant. Paiement en USDT accepté sans problème, livraison confirmée dans la foulée.",
    verified: true,
    status: "approved",
    seeded: true,
  },
  {
    id: "seed-6",
    name: "Hajar",
    rating: 5,
    region: "Agadir",
    product: "Carte Netflix",
    date: "2026-05-22",
    text: "Première commande et clairement pas la dernière. Explications sur la région très utiles avant de payer.",
    verified: true,
    status: "approved",
    seeded: true,
  },
];

export const defaultNavigatorTips: NavigatorTipSetting[] = [
  {
    id: "playstation",
    contexts: ["playstation", "psn", "ps4", "ps5", "sony"],
    type: "compatibility",
    title: "Région du compte PlayStation",
    message:
      "La région de votre compte PlayStation doit correspondre à la région de la carte cadeau. Une carte d'une autre région ne pourra pas être utilisée.",
    enabled: true,
  },
  {
    id: "steam",
    contexts: ["steam", "valve"],
    type: "compatibility",
    title: "Steam Wallet et région",
    message:
      "Les codes Steam Wallet sont spécifiques à une région. Vérifiez la région de votre compte Steam avant de valider votre achat.",
    enabled: true,
  },
  {
    id: "netflix",
    contexts: ["netflix"],
    type: "information",
    title: "Vérifiez votre région Netflix",
    message:
      "Confirmez la région de votre abonnement Netflix avant l'achat pour être sûr que le code sera bien accepté sur votre compte.",
    enabled: true,
  },
  {
    id: "xbox",
    contexts: ["xbox", "microsoft", "game pass"],
    type: "compatibility",
    title: "Région du compte Xbox",
    message:
      "Les crédits et abonnements Xbox dépendent de la région du compte Microsoft. Choisissez la région correspondant à votre compte.",
    enabled: true,
  },
  {
    id: "general",
    contexts: ["general"],
    type: "information",
    title: "Livraison après paiement",
    message:
      "Les produits numériques sont livrés après confirmation du paiement, sur votre page de suivi et par e-mail. Gardez votre e-mail à portée de main.",
    enabled: true,
  },
];

export const defaultDeliverySteps: DeliveryStepSetting[] = [
  {
    id: "choose",
    title: "Choisissez votre produit",
    text: "Sélectionnez le produit, la région et le montant qui vous conviennent.",
    enabled: true,
  },
  {
    id: "pay",
    title: "Réglez votre paiement",
    text: "Choisissez un moyen de paiement disponible et finalisez votre commande.",
    enabled: true,
  },
  {
    id: "verify",
    title: "Vérification du paiement",
    text: "Notre équipe confirme la réception de votre paiement, généralement très vite.",
    enabled: true,
  },
  {
    id: "deliver",
    title: "Livraison numérique",
    text: "Votre code est publié sur votre page de suivi et envoyé par e-mail.",
    enabled: true,
  },
  {
    id: "redeem",
    title: "Utilisez votre code",
    text: "Activez votre code sur la plateforme concernée, dans la bonne région.",
    enabled: true,
  },
];

export const defaultFaqCategories: FaqCategorySetting[] = [
  { id: "before-purchase", label: "Avant l'achat" },
  { id: "payments", label: "Paiements" },
  { id: "delivery", label: "Livraison" },
  { id: "accounts", label: "Comptes" },
  { id: "regions", label: "Régions" },
  { id: "refunds", label: "Remboursements" },
  { id: "support", label: "Support" },
];

export const defaultFaqItems: FaqItemSetting[] = [
  {
    id: "delivery-time",
    category: "delivery",
    question: "Combien de temps prend la livraison ?",
    answer:
      "La livraison est numérique. Une fois votre paiement confirmé, votre code est disponible sur votre page de suivi et envoyé par e-mail, généralement en quelques minutes.",
    enabled: true,
  },
  {
    id: "how-receive-code",
    category: "delivery",
    question: "Comment vais-je recevoir mon code ?",
    answer:
      "Votre code apparaît sur votre page de suivi de commande et vous est également envoyé par e-mail à l'adresse utilisée lors de l'achat.",
    enabled: true,
  },
  {
    id: "which-region",
    category: "regions",
    question: "Quelle région dois-je choisir ?",
    answer:
      "Choisissez la région qui correspond à celle de votre compte (PlayStation, Steam, Xbox…). Chaque fiche produit indique clairement la région, et le Navigateur vous prévient en cas de doute.",
    enabled: true,
  },
  {
    id: "buy-for-someone",
    category: "before-purchase",
    question: "Puis-je acheter pour quelqu'un d'autre ?",
    answer:
      "Oui. Les produits numériques sont des codes : vous pouvez les offrir en transmettant simplement le code reçu à la personne de votre choix.",
    enabled: true,
  },
  {
    id: "change-payment",
    category: "payments",
    question: "Puis-je changer de moyen de paiement ?",
    answer:
      "Tant que le paiement n'est pas confirmé, vous pouvez recommencer votre commande et sélectionner un autre moyen de paiement parmi ceux disponibles.",
    enabled: true,
  },
  {
    id: "which-payments",
    category: "payments",
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Nous affichons uniquement les moyens de paiement réellement disponibles (virement bancaire, USDT, PayPal…). La liste à jour est visible sur la page de paiement et dans le pied de page.",
    enabled: true,
  },
  {
    id: "code-not-working",
    category: "accounts",
    question: "Que faire si mon code ne fonctionne pas ?",
    answer:
      "Contactez le support avec votre numéro de commande et l'e-mail utilisé. La cause la plus fréquente est une différence de région : nous vous aidons à vérifier et à trouver une solution.",
    enabled: true,
  },
  {
    id: "refunds",
    category: "refunds",
    question: "Comment fonctionnent les remboursements ?",
    answer:
      "Avant livraison, une commande non confirmée peut être annulée. Une fois le code révélé, un remboursement reste possible en cas d'erreur avérée, de doublon ou de code invalide imputable à ghost.ma.",
    enabled: true,
  },
  {
    id: "contact-support",
    category: "support",
    question: "Puis-je contacter le support ?",
    answer:
      "Oui, une équipe locale est disponible en français et en arabe par e-mail et WhatsApp. Vous trouverez les coordonnées dans le pied de page et sur la page de contact.",
    enabled: true,
  },
];

// ── Pure selectors (shared server + client) ──────────────────────────────────

/** Enabled why-choose-us cards, in order. */
export function visibleWhyGhost(
  items: WhyGhostItemSetting[],
): WhyGhostItemSetting[] {
  return items.filter((item) => item.enabled && item.title.trim());
}

/**
 * Customer-visible reviews: approved only. This is the single seam a future
 * real-review data source plugs into — swap the input, keep the storefront.
 */
export function visibleReviews(reviews: ReviewSetting[]): ReviewSetting[] {
  return reviews
    // Never surface SEEDED demo reviews as real: they carry names, cities,
    // dates and a "Vérifié / Achats vérifiés" badge but correspond to no real
    // order. Until a real Review pipeline exists, only genuine (non-seeded)
    // admin-approved reviews render; the homepage section self-hides when there
    // are none. Removing this filter would present fabricated testimonials as
    // verified purchases.
    .filter((review) => !review.seeded && review.status === "approved" && review.text.trim())
    .map((review) => ({
      ...review,
      rating: clampRating(review.rating),
    }));
}

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export type ReviewSummary = {
  count: number;
  average: number;
  /** Count per star value (1..5). */
  distribution: Record<number, number>;
};

export function reviewSummary(reviews: ReviewSetting[]): ReviewSummary {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const review of reviews) {
    const r = clampRating(review.rating);
    distribution[r] += 1;
    total += r;
  }
  const count = reviews.length;
  const average = count === 0 ? 0 : Math.round((total / count) * 10) / 10;
  return { count, average, distribution };
}

/**
 * Selects the enabled Navigator tips that apply to a context. A tip matches
 * when any of its context tokens appears in the provided keywords (either side
 * as a substring, case-insensitive). Tips scoped to `general` are returned when
 * `includeGeneral` is set and no more specific tip matched, so a page always
 * has helpful — never redundant — guidance.
 */
export function selectNavigatorTips(
  tips: NavigatorTipSetting[],
  keywords: string[],
  { includeGeneral = true, limit }: { includeGeneral?: boolean; limit?: number } = {},
): NavigatorTipSetting[] {
  const haystack = keywords
    .filter(Boolean)
    .map((k) => k.toLowerCase());
  const enabled = tips.filter((tip) => tip.enabled && tip.message.trim());

  const specific = enabled.filter((tip) =>
    tip.contexts.some(
      (ctx) =>
        ctx !== "general" &&
        haystack.some(
          (word) => word.includes(ctx.toLowerCase()) || ctx.toLowerCase().includes(word),
        ),
    ),
  );

  let selected = specific;
  if (selected.length === 0 && includeGeneral) {
    selected = enabled.filter((tip) => tip.contexts.includes("general"));
  }
  return typeof limit === "number" ? selected.slice(0, limit) : selected;
}

/** Enabled delivery steps, in order. */
export function visibleDeliverySteps(
  steps: DeliveryStepSetting[],
): DeliveryStepSetting[] {
  return steps.filter((step) => step.enabled && step.title.trim());
}

/** Enabled FAQ items, in order. */
export function visibleFaqItems(items: FaqItemSetting[]): FaqItemSetting[] {
  return items.filter((item) => item.enabled && item.question.trim() && item.answer.trim());
}

/** FAQ categories that actually contain at least one visible item. */
export function usedFaqCategories(
  categories: FaqCategorySetting[],
  items: FaqItemSetting[],
): FaqCategorySetting[] {
  const used = new Set(visibleFaqItems(items).map((item) => item.category));
  return categories.filter((category) => used.has(category.id));
}
