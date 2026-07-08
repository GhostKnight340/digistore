import type {
  PaymentMethodDTO,
  PaymentMethodDetails,
  PaymentMethodType,
  PaymentMethodValidation,
} from "@/lib/dto";

/**
 * Generic bank-transfer method: at checkout every active bank account collapses
 * into ONE method with this id ("Virement bancaire"). New bank orders store
 * this literal in `order.paymentMethod`; the specific bank the customer picks
 * on the payment page is stored separately in `order.bankAccountId`.
 */
export const BANK_TRANSFER_METHOD_ID = "BANK_TRANSFER";
export const BANK_TRANSFER_LABEL = "Virement bancaire";

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

  // Old orders sometimes stored a human label ("CIH BANK", "Virement
  // bancaire") or the generic literal instead of a type — treat all of those
  // as the "bank" family so they still resolve to a real bank account.
  const normalized = paymentMethod.trim().toLowerCase();
  const legacyType =
    paymentMethod === "usdt"
      ? "crypto"
      : paymentMethod === BANK_TRANSFER_METHOD_ID ||
          normalized.includes("bank") ||
          normalized.includes("virement") ||
          normalized.includes("rib")
        ? "bank"
        : paymentMethod;
  const byType = methods
    .filter((m) => m.type === legacyType && !m.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return byType ?? null;
}

/** Active bank accounts, in checkout order. */
export function bankMethods(methods: PaymentMethodDTO[]): PaymentMethodDTO[] {
  return methods
    .filter((m) => m.type === "bank")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The single synthetic "Virement bancaire" method shown at checkout in place
 * of the individual bank accounts. Branding is generic (the customer picks the
 * actual bank later), positioned where the first bank account sat.
 */
export function bankTransferCheckoutMethod(
  banks: PaymentMethodDTO[],
): PaymentMethodDTO {
  const first = banks[0];
  const subtitle =
    banks.length > 1
      ? "Choisissez votre banque à l'étape suivante"
      : (first?.details.bankName || first?.name || "RIB / IBAN · virement manuel");
  return {
    id: BANK_TRANSFER_METHOD_ID,
    type: "bank",
    name: BANK_TRANSFER_LABEL,
    subtitle,
    customerNote: "",
    status: "active",
    visible: true,
    sortOrder: first?.sortOrder ?? 0,
    logoUrl: null,
    initials: "BQ",
    accentColor: "#3e7bfa",
    logoType: "initials",
    details: {},
    proofRequired: true,
    internalNote: "",
    minAmount: null,
    maxAmount: null,
    regions: [],
    archivedAt: null,
    updatedAt: first?.updatedAt ?? new Date(0).toISOString(),
  };
}

/**
 * Checkout method list with all bank accounts collapsed into one
 * "Virement bancaire" entry. Non-bank methods are left untouched and ordering
 * is preserved (the bank entry takes the position of the first bank account).
 */
export function buildCheckoutMethods(
  methods: PaymentMethodDTO[],
): PaymentMethodDTO[] {
  const banks = bankMethods(methods);
  const result: PaymentMethodDTO[] = [];
  let bankInserted = false;
  for (const method of [...methods].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (method.type === "bank") {
      if (!bankInserted) {
        result.push(bankTransferCheckoutMethod(banks));
        bankInserted = true;
      }
      continue;
    }
    result.push(method);
  }
  return result;
}

/** Whether an order should be treated as a bank transfer (new or legacy). */
export function isBankTransferOrder(
  paymentMethod: string,
  methods: PaymentMethodDTO[],
): boolean {
  if (paymentMethod === BANK_TRANSFER_METHOD_ID) return true;
  return resolveOrderPaymentMethod(paymentMethod, methods)?.type === "bank";
}

/**
 * The bank account to display for a bank order, given the customer's saved
 * selection (`bankAccountId`) with safe fallbacks: the explicitly selected
 * account, else the legacy account encoded in `paymentMethod`, else the sole
 * active bank (auto-select), else the first active bank.
 */
export function resolveSelectedBank(
  order: { paymentMethod: string; bankAccountId?: string | null },
  methods: PaymentMethodDTO[],
): PaymentMethodDTO | null {
  const banks = bankMethods(methods);
  if (order.bankAccountId) {
    const chosen = methods.find((m) => m.id === order.bankAccountId);
    if (chosen) return chosen;
  }
  const legacy = resolveOrderPaymentMethod(order.paymentMethod, methods);
  if (legacy?.type === "bank") return legacy;
  return banks[0] ?? null;
}

/** Friendly payment-method label + bank name for an order (Discord, admin). */
export function describeOrderPaymentMethod(
  order: { paymentMethod: string; bankAccountId?: string | null },
  methods: PaymentMethodDTO[],
): { label: string; bankName: string | null } {
  if (isBankTransferOrder(order.paymentMethod, methods)) {
    const bank = resolveSelectedBank(order, methods);
    return {
      label: BANK_TRANSFER_LABEL,
      bankName: bank ? bank.details.bankName || bank.name : null,
    };
  }
  const method = resolveOrderPaymentMethod(order.paymentMethod, methods);
  return { label: method?.name ?? order.paymentMethod, bankName: null };
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
