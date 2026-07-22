export const PAYMENT_PROOF_REQUEST_REASONS = [
  "Le justificatif est illisible.",
  "Le montant n’est pas visible.",
  "La référence de transaction est manquante.",
  "Le justificatif ne correspond pas à cette commande.",
  "La capture d’écran est incomplète.",
] as const;

export function isValidPaymentRecipient(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePaymentProofRequest(input: {
  subject: string;
  message: string;
  reason: string;
  idempotencyKey: string;
}): string | null {
  if (!input.subject.trim() || !input.message.trim() || !input.reason.trim()) {
    return "Le sujet, le motif et le message sont obligatoires.";
  }
  if (!input.idempotencyKey.trim()) return "Clé d’envoi invalide.";
  return null;
}
