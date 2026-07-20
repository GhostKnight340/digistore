/**
 * Admin Email Composer — template presets (the template picker).
 *
 * These are STARTER presets for the composer: each seeds the subject, preheader,
 * eyebrow, title and a set of content modules that the admin then edits. They
 * reuse the same branded shell + variables + renderer as the transactional
 * emails (they are not a second, disconnected email system). Pure/testable.
 */

import type { EmailModule } from "./composerModules";

/** Distributive Omit so each union member keeps its own fields (a plain
 *  Omit<Union, K> collapses to the members' common keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ModuleSeed = DistributiveOmit<EmailModule, "id">;

export type ComposerTemplate = {
  key: string;
  label: string;
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  /** Starter modules (ids are assigned client-side when the preset is applied). */
  modules: ModuleSeed[];
};

export const COMPOSER_TEMPLATES: ComposerTemplate[] = [
  {
    key: "custom",
    label: "Message personnalisé",
    subject: "Un message de la part de ghost.ma",
    preheader: "",
    eyebrow: "Ghost.ma",
    title: "",
    modules: [{ type: "text", body: "" }],
  },
  {
    key: "apology",
    label: "Excuses / geste commercial",
    subject: "Toutes nos excuses — un geste de notre part",
    preheader: "Nous sommes désolés pour ce désagrément.",
    eyebrow: "Service client",
    title: "Toutes nos excuses",
    modules: [
      {
        type: "text",
        body:
          "Nous sommes sincèrement désolés pour le désagrément rencontré. Votre satisfaction est notre priorité et nous tenons à nous rattraper.",
      },
      {
        type: "credit",
        amountMad: 5,
        title: "Crédit Ghost offert",
        description: "Nous avons ajouté un crédit Ghost sur votre compte en guise de geste commercial.",
        behavior: "grant",
        buttonLabel: "Voir mon solde",
      },
      { type: "signature", name: "L'équipe ghost.ma", title: "Service client" },
    ],
  },
  {
    key: "order_update",
    label: "Mise à jour de commande",
    subject: "Mise à jour de votre commande {{order.number}}",
    preheader: "Le point sur votre commande.",
    eyebrow: "Commande",
    title: "Mise à jour de votre commande",
    modules: [
      { type: "text", body: "Voici les dernières informations concernant votre commande." },
    ],
  },
  {
    key: "payment_issue",
    label: "Problème de paiement",
    subject: "Action requise sur votre paiement",
    preheader: "Nous avons besoin d'une information pour valider votre paiement.",
    eyebrow: "Paiement",
    title: "Problème de paiement",
    modules: [
      {
        type: "notice",
        style: "warning",
        heading: "Paiement en attente",
        body: "Nous n'avons pas pu valider votre paiement. Merci de vérifier les informations ci-dessous.",
      },
    ],
  },
  {
    key: "proof_required",
    label: "Justificatif requis",
    subject: "Un justificatif est nécessaire",
    preheader: "Merci de nous transmettre un justificatif de paiement.",
    eyebrow: "Paiement",
    title: "Justificatif requis",
    modules: [
      {
        type: "text",
        body: "Pour valider votre commande, merci de nous transmettre un justificatif de paiement lisible.",
      },
    ],
  },
  {
    key: "refund",
    label: "Remboursement",
    subject: "Votre remboursement",
    preheader: "Le point sur votre remboursement.",
    eyebrow: "Remboursement",
    title: "Votre remboursement",
    modules: [
      { type: "text", body: "Nous vous confirmons le traitement de votre remboursement." },
    ],
  },
  {
    key: "ghost_credit_gift",
    label: "Crédit Ghost offert",
    subject: "Un crédit Ghost vous attend 🎁",
    preheader: "Nous avons ajouté du crédit Ghost sur votre compte.",
    eyebrow: "Crédit Ghost",
    title: "Un cadeau pour vous",
    modules: [
      {
        type: "credit",
        amountMad: 5,
        title: "Crédit Ghost offert",
        description: "Merci pour votre confiance. Profitez de ce crédit sur votre prochaine commande.",
        behavior: "grant",
        buttonLabel: "Voir mon solde",
      },
    ],
  },
  {
    key: "general_info",
    label: "Information générale",
    subject: "Information importante — ghost.ma",
    preheader: "",
    eyebrow: "Information",
    title: "Information",
    modules: [{ type: "text", body: "" }],
  },
];

export function getComposerTemplate(key: string): ComposerTemplate | null {
  return COMPOSER_TEMPLATES.find((t) => t.key === key) ?? null;
}

export const COMPOSER_TEMPLATE_SUMMARIES = COMPOSER_TEMPLATES.map((t) => ({
  key: t.key,
  label: t.label,
}));
