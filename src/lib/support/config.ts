/**
 * Guided-support flow data: categories, sub-issues, and self-help entries.
 * Pure (no DB / server-only) so the client flow and the server action share
 * one source of truth — the server re-validates category/sub-issue ids and
 * freezes the French label onto the ticket at submit time.
 *
 * `isGeneric` replaces the prototype's id-suffix heuristic: a generic ("Autre…")
 * issue keeps the message field non-optional to encourage detail.
 */

export type SupportSubIssue = {
  id: string;
  label: string;
  /** Generic "Autre …" issues: message is encouraged (not marked optional). */
  isGeneric?: boolean;
  /** Show the self-help step before order/contact. */
  helpId?: string;
};

export type SupportCategory = {
  key: string;
  label: string;
  description: string;
  /** Order-related categories route through the order-selection step. */
  needsOrder: boolean;
  question: string;
  subs: SupportSubIssue[];
};

export type SupportHelpEntry = { title: string; tips: string[] };

export const SUPPORT_HELP: Record<string, SupportHelpEntry> = {
  c1: {
    title: "Quelques vérifications rapides",
    tips: [
      "Vérifiez que la région du produit correspond à celle de votre compte.",
      "Vérifiez les caractères similaires comme 0/O ou 1/I.",
      "Consultez les instructions d'activation du produit.",
      "Vérifiez que le code est utilisé sur la bonne plateforme.",
    ],
  },
  c5: {
    title: "Comment activer votre produit",
    tips: [
      "Rendez-vous sur la plateforme officielle du produit.",
      "Connectez-vous au compte correspondant à la bonne région.",
      "Saisissez le code exactement comme il apparaît, sans espaces.",
      "Consultez le guide d'activation joint à votre e-mail de livraison.",
    ],
  },
  l2: {
    title: "Quelques vérifications rapides",
    tips: [
      "Consultez votre dossier spam ou courrier indésirable.",
      "Vérifiez l'adresse e-mail utilisée lors de la commande.",
      "Patientez quelques minutes : la livraison peut prendre un instant.",
      "Ajoutez notre adresse d'envoi à vos contacts.",
    ],
  },
  a1: {
    title: "Quelques vérifications rapides",
    tips: [
      "Vérifiez que votre e-mail et votre mot de passe sont corrects.",
      "Réinitialisez votre mot de passe si besoin.",
      "Essayez un autre navigateur ou une navigation privée.",
      "Désactivez temporairement vos extensions.",
    ],
  },
  a3: {
    title: "Quelques vérifications rapides",
    tips: [
      "Consultez votre dossier spam ou courrier indésirable.",
      "Vérifiez que l'adresse e-mail saisie est correcte.",
      "Attendez une à deux minutes après votre inscription.",
      "Demandez un nouvel envoi depuis la page de connexion.",
    ],
  },
};

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    key: "paiement",
    label: "Paiement",
    description: "Paiement en attente, justificatif ou mode de paiement",
    needsOrder: true,
    question: "Quel problème rencontrez-vous avec votre paiement ?",
    subs: [
      { id: "p1", label: "J'ai payé mais mon paiement n'est pas confirmé" },
      { id: "p2", label: "Mon justificatif a été refusé" },
      { id: "p3", label: "J'ai envoyé le mauvais montant" },
      { id: "p4", label: "Je souhaite changer de mode de paiement" },
      { id: "p5", label: "Autre problème de paiement", isGeneric: true },
    ],
  },
  {
    key: "livraison",
    label: "Livraison",
    description: "Commande payée mais produit non reçu",
    needsOrder: true,
    question: "Quel est le problème avec votre livraison ?",
    subs: [
      { id: "l1", label: "Ma commande est payée mais je n'ai rien reçu" },
      { id: "l2", label: "Je n'ai pas reçu l'e-mail de livraison", helpId: "l2" },
      { id: "l3", label: "Ma livraison prend plus de temps que prévu" },
      { id: "l4", label: "Autre problème de livraison", isGeneric: true },
    ],
  },
  {
    key: "code",
    label: "Code ou produit",
    description: "Code invalide, région ou problème d'activation",
    needsOrder: true,
    question: "Quel est le problème avec votre code ou produit ?",
    subs: [
      { id: "c1", label: "Mon code ne fonctionne pas", helpId: "c1" },
      { id: "c2", label: "Mon code semble déjà utilisé" },
      { id: "c3", label: "J'ai acheté la mauvaise région" },
      { id: "c4", label: "J'ai acheté le mauvais produit ou montant" },
      { id: "c5", label: "Je ne sais pas comment activer mon produit", helpId: "c5" },
      { id: "c6", label: "Autre problème avec mon produit", isGeneric: true },
    ],
  },
  {
    key: "commande",
    label: "Commande",
    description: "Modifier, annuler ou suivre une commande",
    needsOrder: true,
    question: "Que souhaitez-vous faire concernant votre commande ?",
    subs: [
      { id: "o1", label: "Je n'ai pas reçu de confirmation de commande" },
      { id: "o2", label: "Je souhaite modifier ma commande" },
      { id: "o3", label: "Je souhaite annuler ma commande" },
      { id: "o4", label: "Ma commande est bloquée en traitement" },
      { id: "o5", label: "Autre problème de commande", isGeneric: true },
    ],
  },
  {
    key: "remboursement",
    label: "Remboursement",
    description: "Demander ou suivre un remboursement",
    needsOrder: true,
    question: "Quelle est votre demande de remboursement ?",
    subs: [
      { id: "r1", label: "Je souhaite être remboursé" },
      { id: "r2", label: "Où en est mon remboursement ?" },
      { id: "r3", label: "J'ai été facturé deux fois" },
      { id: "r4", label: "Autre demande de remboursement", isGeneric: true },
    ],
  },
  {
    key: "compte",
    label: "Compte",
    description: "Connexion, e-mail ou informations personnelles",
    needsOrder: false,
    question: "Quel problème rencontrez-vous avec votre compte ?",
    subs: [
      { id: "a1", label: "Je n'arrive pas à me connecter", helpId: "a1" },
      { id: "a2", label: "Je souhaite modifier mes informations" },
      { id: "a3", label: "Je n'ai pas reçu l'e-mail de vérification", helpId: "a3" },
      { id: "a4", label: "Je souhaite supprimer mon compte" },
      { id: "a5", label: "Autre problème de compte", isGeneric: true },
    ],
  },
  {
    key: "technique",
    label: "Problème technique",
    description: "Erreur du site, page bloquée ou bug",
    needsOrder: false,
    question: "Quel problème technique rencontrez-vous ?",
    subs: [
      { id: "t1", label: "Le site ne se charge pas correctement" },
      { id: "t2", label: "Le paiement échoue à répétition" },
      { id: "t3", label: "Une page affiche une erreur" },
      { id: "t4", label: "Autre problème technique", isGeneric: true },
    ],
  },
  {
    key: "autre",
    label: "Autre demande",
    description: "Une question qui ne rentre dans aucune catégorie",
    needsOrder: false,
    question: "Comment pouvons-nous vous aider ?",
    subs: [
      { id: "x1", label: "J'ai une question avant d'acheter" },
      { id: "x2", label: "Partenariats et revente" },
      { id: "x3", label: "Autre demande", isGeneric: true },
    ],
  },
];

export function findSupportCategory(key: string): SupportCategory | undefined {
  return SUPPORT_CATEGORIES.find((c) => c.key === key);
}

export function findSupportSubIssue(
  categoryKey: string,
  subId: string,
): SupportSubIssue | undefined {
  return findSupportCategory(categoryKey)?.subs.find((s) => s.id === subId);
}
