/**
 * Shared enums + French labels for the expense ledger. Kept as plain unions
 * (no DB/server-only) so both server and client can import them. The DB stores
 * these as plain strings, matching the rest of the schema's status-as-string
 * convention.
 */

export const EXPENSE_CATEGORIES = [
  "hebergement",
  "domaine",
  "base_de_donnees",
  "email",
  "api_fournisseur",
  "marketing",
  "publicite",
  "logiciel",
  "support",
  "frais_paiement",
  "comptabilite",
  "autre",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  hebergement: "Hébergement",
  domaine: "Domaine",
  base_de_donnees: "Base de données",
  email: "E-mail",
  api_fournisseur: "API / Fournisseur",
  marketing: "Marketing",
  publicite: "Publicité",
  logiciel: "Logiciel",
  support: "Support",
  frais_paiement: "Frais de paiement",
  comptabilite: "Comptabilité",
  autre: "Autre",
};

export const EXPENSE_TYPES = ["recurring", "one_time", "usage_based", "credit"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  recurring: "Récurrente",
  one_time: "Ponctuelle",
  usage_based: "Variable",
  credit: "Crédit / Remboursement",
};

export const EXPENSE_STATUSES = [
  "upcoming",
  "pending",
  "paid",
  "overdue",
  "cancelled",
  "estimated",
  "credit",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  upcoming: "À venir",
  pending: "En attente",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
  estimated: "Estimée",
  credit: "Crédit / Remboursement",
};

export const EXPENSE_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "custom",
] as const;
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

export const EXPENSE_FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  semiannual: "Semestrielle",
  yearly: "Annuelle",
  custom: "Personnalisée",
};

export const RECURRING_STATUSES = ["active", "paused", "cancelled"] as const;
export type RecurringStatus = (typeof RECURRING_STATUSES)[number];

/** Currencies the admin can pick. Reporting/DH conversion relies on the pricing
 *  FX table (fxRatesToMad); MAD is the base (rate 1). This list is a convenience
 *  default — any currency present in the FX table also works. */
export const EXPENSE_CURRENCIES = ["MAD", "USD", "EUR", "GBP"] as const;
export type ExpenseCurrency = string;

export function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORY_LABELS[value as ExpenseCategory] ?? value;
}
export function expenseTypeLabel(value: string): string {
  return EXPENSE_TYPE_LABELS[value as ExpenseType] ?? value;
}
export function expenseStatusLabel(value: string): string {
  return EXPENSE_STATUS_LABELS[value as ExpenseStatus] ?? value;
}
export function expenseFrequencyLabel(value: string): string {
  return EXPENSE_FREQUENCY_LABELS[value as ExpenseFrequency] ?? value;
}
