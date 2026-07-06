import type {
  PaymentMethodDTO,
  PaymentMethodDetails,
  PaymentMethodType,
  PaymentMethodValidation,
} from "@/lib/dto";

/**
 * Legacy orders stored the coarse method type ("bank" / "usdt" / "paypal" /
 * "card" / "test") as `paymentMethod`; orders created after the payment
 * methods migration store the specific method's id. Try the id first, then
 * fall back to the first non-archived method of the matching legacy type so
 * old orders keep rendering.
 */
export function resolveOrderPaymentMethod(
  paymentMethod: string,
  methods: PaymentMethodDTO[],
): PaymentMethodDTO | null {
  const byId = methods.find((m) => m.id === paymentMethod);
  if (byId) return byId;

  const legacyType = paymentMethod === "usdt" ? "crypto" : paymentMethod;
  const byType = methods
    .filter((m) => m.type === legacyType && !m.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return byType ?? null;
}

/** Required-for-active fields per type, from the design's field list. */
export function validatePaymentMethod(method: {
  type: PaymentMethodType;
  name: string;
  details: PaymentMethodDetails;
}): PaymentMethodValidation {
  const fieldErrors: Record<string, string> = {};

  if (!method.name.trim()) {
    fieldErrors.name = "Le nom affiché est requis.";
  }

  switch (method.type) {
    case "bank":
      if (!method.details.rib?.trim() && !method.details.accountNumber?.trim()) {
        fieldErrors["details.rib"] = "RIB ou numéro de compte requis.";
      }
      break;
    case "paypal":
      if (!method.details.email?.trim() && !method.details.meLink?.trim()) {
        fieldErrors["details.email"] = "E-mail PayPal ou lien PayPal.Me requis.";
      }
      break;
    case "crypto":
      if (!method.details.walletAddress?.trim()) {
        fieldErrors["details.walletAddress"] = "Adresse du portefeuille requise.";
      }
      break;
    case "card":
      // A coming-soon card is exempt from required-field validation.
      break;
    case "cash":
    case "custom":
      break;
  }

  return { complete: Object.keys(fieldErrors).length === 0, fieldErrors };
}

export const PAYMENT_METHOD_TYPES: {
  type: PaymentMethodType;
  label: string;
  description: string;
  defaultAccent: string;
  defaultInitials: string;
}[] = [
  { type: "bank", label: "Virement bancaire", description: "RIB / IBAN, virement manuel", defaultAccent: "#3e7bfa", defaultInitials: "BQ" },
  { type: "paypal", label: "PayPal", description: "E-mail PayPal ou lien PayPal.Me", defaultAccent: "#0a3d91", defaultInitials: "PP" },
  { type: "crypto", label: "Crypto · USDT", description: "Adresse de portefeuille + réseau", defaultAccent: "#26a17b", defaultInitials: "₮" },
  { type: "card", label: "Carte bancaire", description: "Paiement par carte (à venir)", defaultAccent: "#8b5cf6", defaultInitials: "CB" },
  { type: "cash", label: "Espèces / à la livraison", description: "Paiement en main propre", defaultAccent: "#1f6f47", defaultInitials: "CA" },
  { type: "custom", label: "Personnalisé", description: "Toute autre méthode", defaultAccent: "#2c3445", defaultInitials: "PM" },
];

export function paymentMethodTypeLabel(type: PaymentMethodType): string {
  return PAYMENT_METHOD_TYPES.find((t) => t.type === type)?.label ?? type;
}
