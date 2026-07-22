/** Browser-safe refund email metadata used by the admin composer. */
export type RefundEmailTemplateKey =
  | "info_required"
  | "approved"
  | "not_eligible"
  | "refund_sent"
  | "credit_issued"
  | "replacement_delivered";

export const REFUND_EMAIL_TEMPLATE_LABELS: Record<RefundEmailTemplateKey, string> = {
  info_required: "Informations complémentaires requises",
  approved: "Demande acceptée",
  not_eligible: "Demande non éligible",
  refund_sent: "Remboursement envoyé",
  credit_issued: "Crédit Ghost ajouté",
  replacement_delivered: "Produit de remplacement livré",
};

export const REFUND_REJECTION_REASONS: string[] = [
  "Produit numérique déjà livré ou révélé.",
  "Produit ou région sélectionné incorrectement par le client.",
  "Code confirmé valide.",
  "Demande ne respectant pas les conditions applicables.",
  "Preuve insuffisante.",
  "Suspicion d’abus.",
  "Autre.",
];
