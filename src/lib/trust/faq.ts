/**
 * Global FAQ content — organised into categories, searchable, and deep-linkable.
 *
 * ADMIN-READY: `FAQ_CATEGORIES` is a typed structure that can later be backed by
 * the store-settings CMS. Each question carries a stable `slug` used as the DOM
 * anchor id, so `#faq-<slug>` deep-links to (and auto-opens) a single question.
 * Keep slugs stable once shipped — they may be shared in support replies.
 */

export type FaqItem = {
  /** Stable, URL-safe id. Also the DOM anchor: `#faq-<slug>`. */
  slug: string;
  question: string;
  answer: string;
};

export type FaqCategory = {
  id: string;
  label: string;
  items: FaqItem[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "before-purchase",
    label: "Avant l'achat",
    items: [
      {
        slug: "which-region",
        question: "Quelle région dois-je choisir ?",
        answer:
          "Choisissez la région qui correspond à celle de votre compte (PlayStation, Steam, Xbox…). Un code d'une autre région ne pourra pas être utilisé. En cas de doute, le conseil du Navigator affiché sur la page produit vous guide, ou contactez le support avant de payer.",
      },
      {
        slug: "buy-for-someone",
        question: "Puis-je acheter pour quelqu'un d'autre ?",
        answer:
          "Oui. Les produits sont numériques : vous recevez le code par e-mail et pouvez le transmettre à la personne de votre choix. Assurez-vous simplement que la région du produit correspond à son compte.",
      },
      {
        slug: "are-products-official",
        question: "Les produits sont-ils officiels ?",
        answer:
          "Oui. Nous fournissons uniquement des codes et cartes authentiques, approvisionnés auprès de sources officielles.",
      },
    ],
  },
  {
    id: "payments",
    label: "Paiements",
    items: [
      {
        slug: "payment-methods",
        question: "Quels moyens de paiement acceptez-vous ?",
        answer:
          "Les méthodes disponibles sont affichées à l'étape de paiement et sur la page de paiement (par exemple virement bancaire, USDT et PayPal). Seules les méthodes actives sont proposées.",
      },
      {
        slug: "change-payment-method",
        question: "Puis-je changer de moyen de paiement ?",
        answer:
          "Oui, tant que le paiement n'est pas confirmé. Sur la page de paiement de votre commande, vous pouvez sélectionner une autre méthode disponible.",
      },
      {
        slug: "is-payment-secure",
        question: "Le paiement est-il sécurisé ?",
        answer:
          "Oui. Chaque paiement est vérifié avant la livraison et nous ne stockons aucune donnée bancaire sensible.",
      },
    ],
  },
  {
    id: "delivery",
    label: "Livraison",
    items: [
      {
        slug: "delivery-time",
        question: "Combien de temps prend la livraison ?",
        answer:
          "La livraison est numérique. Une fois le paiement confirmé, votre code est envoyé par e-mail et disponible dans votre compte, généralement en quelques minutes aux heures ouvrées.",
      },
      {
        slug: "how-receive-code",
        question: "Comment vais-je recevoir mon code ?",
        answer:
          "Par e-mail et dans la section « Mes commandes » de votre compte. Pensez à vérifier vos spams si vous ne le voyez pas immédiatement.",
      },
      {
        slug: "not-received",
        question: "Je n'ai pas reçu mon code, que faire ?",
        answer:
          "Vérifiez d'abord vos spams et l'état de votre commande dans votre compte. Si le paiement est confirmé mais que rien n'arrive, contactez le support avec votre numéro de commande — nous réglons cela rapidement.",
      },
    ],
  },
  {
    id: "accounts",
    label: "Comptes",
    items: [
      {
        slug: "need-account",
        question: "Dois-je créer un compte pour commander ?",
        answer:
          "Vous pouvez commander avec votre e-mail. Créer un compte vous permet de retrouver facilement vos commandes, factures et codes à tout moment.",
      },
      {
        slug: "find-my-orders",
        question: "Où retrouver mes commandes ?",
        answer:
          "Dans votre compte, section « Mes commandes ». Vous pouvez aussi utiliser le suivi de commande avec votre e-mail et votre numéro de commande.",
      },
    ],
  },
  {
    id: "regions",
    label: "Régions",
    items: [
      {
        slug: "why-regions-matter",
        question: "Pourquoi la région est-elle importante ?",
        answer:
          "La plupart des cartes et abonnements sont verrouillés par région : un code fonctionne uniquement sur un compte de la même région. C'est pourquoi nous l'indiquons clairement avant l'achat.",
      },
      {
        slug: "wrong-region",
        question: "J'ai choisi la mauvaise région, que faire ?",
        answer:
          "Si le code n'a pas encore été utilisé, contactez le support dès que possible — nous examinons chaque situation au cas par cas. Un code déjà utilisé ne peut pas être échangé.",
      },
    ],
  },
  {
    id: "refunds",
    label: "Remboursements",
    items: [
      {
        slug: "how-refunds-work",
        question: "Comment fonctionnent les remboursements ?",
        answer:
          "Un code numérique non utilisé et non fonctionnel de notre fait peut être remplacé ou remboursé. Un code déjà activé ne peut pas être remboursé. Les détails figurent sur notre page Remboursements.",
      },
      {
        slug: "code-does-not-work",
        question: "Que se passe-t-il si mon code ne fonctionne pas ?",
        answer:
          "Contactez le support avec votre numéro de commande et une capture d'écran du message d'erreur. Après vérification, nous procédons à un remplacement ou à un remboursement selon le cas.",
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      {
        slug: "contact-support",
        question: "Comment contacter le support ?",
        answer:
          "Via le centre d'aide, par e-mail ou sur WhatsApp (coordonnées en bas de page). Indiquez votre numéro de commande pour un traitement plus rapide.",
      },
      {
        slug: "support-hours",
        question: "Le support est-il en français ?",
        answer:
          "Oui, notre équipe locale répond en français et en darija, avant comme après votre achat.",
      },
    ],
  },
];

export const FAQ_ANCHOR_PREFIX = "faq-";

/** Flattened list of every question with its category id — handy for search. */
export function flattenFaq(
  categories: FaqCategory[] = FAQ_CATEGORIES,
): Array<FaqItem & { categoryId: string; categoryLabel: string }> {
  return categories.flatMap((category) =>
    category.items.map((item) => ({
      ...item,
      categoryId: category.id,
      categoryLabel: category.label,
    })),
  );
}

/** Case/diacritic-insensitive contains, so "region" matches "région". */
export function faqMatches(item: FaqItem, query: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const q = normalize(query).trim();
  if (!q) return true;
  return normalize(`${item.question} ${item.answer}`).includes(q);
}
