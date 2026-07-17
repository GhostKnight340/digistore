/**
 * Warning engine — derives the active operational warnings from the current
 * health results + metrics + supplier balances. Pure and deterministic: given
 * the same inputs it produces the same warnings, so a warning "resolves"
 * (disappears) automatically once the underlying condition clears on the next
 * refresh. No warning is persisted; there is nothing stale to reconcile.
 *
 * Balance thresholds are configurable per currency; a supplier balance at or
 * below a tier raises a warning (info → warning → critical as it drops).
 */
import type { HealthResult, OperationalWarning, WarningSeverity } from "./types";
import { sortWarnings } from "./types";

/** Low-balance tiers (in the supplier's own currency units). */
export type BalanceThresholds = { info: number; warning: number; critical: number };

export const DEFAULT_BALANCE_THRESHOLDS: BalanceThresholds = {
  info: 100,
  warning: 50,
  critical: 20,
};

export type WarningInputs = {
  detectedAt: string;
  health: HealthResult[];
  suppliers: {
    slug: string;
    name: string;
    enabled: boolean;
    configured: boolean;
    health: "healthy" | "warning" | "offline" | "unknown" | "disabled" | "unconfigured";
    balanceAmount: string | null;
    balanceCurrency: string | null;
    lastFailureMessage: string | null;
  }[];
  orders: { waitingTooLong: number; paymentIssue: number; recentFailedPurchases: number };
  payments: { rejectedToday: number; confirmedToday: number; misconfiguredCount: number };
  products: { missingSupplyRoute: number; incompleteMapping: number };
  notifications: { emailFailures24h: number; discordFailures24h: number };
  balanceThresholds?: BalanceThresholds;
};

/** High payment rejection ratio (rejected / total decided today) that warrants a flag. */
const HIGH_REJECTION_RATIO = 0.4;
const HIGH_REJECTION_MIN_SAMPLE = 5;

export function computeWarnings(input: WarningInputs): OperationalWarning[] {
  const warnings: OperationalWarning[] = [];
  const at = input.detectedAt;
  const thresholds = input.balanceThresholds ?? DEFAULT_BALANCE_THRESHOLDS;

  const add = (
    id: string,
    severity: WarningSeverity,
    title: string,
    description: string,
    resolveHref?: string,
  ) => warnings.push({ id, severity, title, description, detectedAt: at, resolveHref });

  // ── Infrastructure health → warnings ──────────────────────────────────────
  for (const result of input.health) {
    if (result.status === "offline") {
      add(
        `health:${result.key}`,
        result.key === "database" || result.key === "auth" ? "critical" : "warning",
        `${result.label} hors ligne`,
        result.action ? `${result.message} ${result.action}` : result.message,
        result.href,
      );
    } else if (result.status === "warning") {
      add(`health:${result.key}`, "warning", `${result.label} — attention`, result.message, result.href);
    }
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────
  for (const supplier of input.suppliers) {
    if (supplier.configured && supplier.health === "offline") {
      add(
        `supplier-offline:${supplier.slug}`,
        "critical",
        `${supplier.name} hors ligne`,
        supplier.lastFailureMessage || "Le dernier appel fournisseur a échoué.",
        `/admin/suppliers/${supplier.slug}`,
      );
    }
    // Low balance (only when a balance is known and the supplier is usable).
    if (supplier.configured && supplier.enabled && supplier.balanceAmount != null) {
      const amount = Number(supplier.balanceAmount);
      if (Number.isFinite(amount)) {
        const currency = supplier.balanceCurrency ?? "";
        if (amount <= thresholds.critical) {
          add(
            `supplier-balance:${supplier.slug}`,
            "critical",
            `Solde ${supplier.name} critique`,
            `Solde ${amount} ${currency} — sous le seuil critique (${thresholds.critical} ${currency}). Rechargez le portefeuille.`,
            `/admin/suppliers/${supplier.slug}`,
          );
        } else if (amount <= thresholds.warning) {
          add(
            `supplier-balance:${supplier.slug}`,
            "warning",
            `Solde ${supplier.name} faible`,
            `Solde ${amount} ${currency} — sous ${thresholds.warning} ${currency}.`,
            `/admin/suppliers/${supplier.slug}`,
          );
        } else if (amount <= thresholds.info) {
          add(
            `supplier-balance:${supplier.slug}`,
            "info",
            `Solde ${supplier.name} à surveiller`,
            `Solde ${amount} ${currency} — sous ${thresholds.info} ${currency}.`,
            `/admin/suppliers/${supplier.slug}`,
          );
        }
      }
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  if (input.orders.waitingTooLong > 0) {
    add(
      "orders-stuck",
      "warning",
      `${input.orders.waitingTooLong} commande(s) en attente de vérification`,
      "Des preuves de paiement attendent une revue depuis trop longtemps.",
      "/admin?tab=orders",
    );
  }
  if (input.orders.recentFailedPurchases > 0) {
    add(
      "orders-failed-purchases",
      "warning",
      `${input.orders.recentFailedPurchases} achat(s) fournisseur en échec aujourd’hui`,
      "Une ou plusieurs livraisons automatiques ont échoué — vérifiez les journaux fournisseur.",
      "/admin/suppliers",
    );
  }
  if (input.orders.paymentIssue > 0) {
    add(
      "orders-payment-issue",
      "warning",
      `${input.orders.paymentIssue} commande(s) avec un problème de paiement`,
      "Ces commandes nécessitent une intervention manuelle.",
      "/admin?tab=orders",
    );
  }

  // ── Payments ──────────────────────────────────────────────────────────────
  if (input.payments.misconfiguredCount > 0) {
    add(
      "payments-misconfigured",
      "warning",
      `${input.payments.misconfiguredCount} moyen(s) de paiement mal configuré(s)`,
      "Un moyen actif est incomplet — les clients ne pourront pas payer.",
      "/admin?tab=payment-settings",
    );
  }
  const decidedToday = input.payments.rejectedToday + input.payments.confirmedToday;
  if (
    decidedToday >= HIGH_REJECTION_MIN_SAMPLE &&
    input.payments.rejectedToday / decidedToday >= HIGH_REJECTION_RATIO
  ) {
    add(
      "payments-high-rejection",
      "warning",
      "Taux de rejet des paiements élevé",
      `${input.payments.rejectedToday} rejet(s) sur ${decidedToday} décisions aujourd’hui.`,
      "/admin?tab=orders",
    );
  }

  // ── Products ──────────────────────────────────────────────────────────────
  if (input.products.missingSupplyRoute > 0) {
    add(
      "products-no-route",
      "warning",
      `${input.products.missingSupplyRoute} produit(s) sans approvisionnement`,
      "Aucun fournisseur mappé et livraison manuelle désactivée — ces produits ne peuvent pas être honorés.",
      "/admin?tab=products",
    );
  }
  if (input.products.incompleteMapping > 0) {
    add(
      "products-incomplete-mapping",
      "info",
      `${input.products.incompleteMapping} produit(s) au mapping incomplet`,
      "Certains mappings fournisseur sont invalides ou désactivés.",
      "/admin?tab=products",
    );
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  if (input.notifications.emailFailures24h >= 3) {
    add(
      "email-failures",
      "warning",
      `${input.notifications.emailFailures24h} échec(s) d’e-mail sur 24 h`,
      "Plusieurs e-mails n’ont pas pu être envoyés.",
      "/admin?tab=email-templates",
    );
  }
  if (input.notifications.discordFailures24h >= 3) {
    add(
      "discord-failures",
      "warning",
      `${input.notifications.discordFailures24h} échec(s) Discord sur 24 h`,
      "Plusieurs livraisons Discord ont échoué.",
    );
  }

  return sortWarnings(warnings);
}
