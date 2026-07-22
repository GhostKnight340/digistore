/**
 * Safe action registry for the CEO Briefing.
 *
 * The AI may only ever return an approved ActionId — never a URL. Every id is
 * resolved HERE, server-controlled, to a REAL admin route (verified against the
 * app's routing: standalone routes like /admin/suppliers, and in-dashboard
 * panels like /admin?tab=payments). Entity-specific hrefs (a supplier slug, an
 * order id) are filled deterministically from the chosen candidate, not from
 * anything the model produced.
 *
 * PURE and client-safe.
 */

import type { CeoBriefingActionDTO } from "@/lib/dto";
import type { ActionId, CandidateIssue } from "./types";

interface ActionDef {
  label: string;
  /** Static href, or a builder that reads entity params off the candidate. */
  href: string | ((c: CandidateIssue | undefined) => string);
}

const REGISTRY: Record<ActionId, ActionDef> = {
  OPEN_SUPPLIERS: { label: "Ouvrir les fournisseurs", href: "/admin/suppliers" },
  OPEN_SUPPLIER_DETAIL: {
    label: "Voir le fournisseur",
    href: (c) => (c?.supplierSlug ? `/admin/suppliers/${c.supplierSlug}` : "/admin/suppliers"),
  },
  OPEN_PAYMENT_SETTINGS: { label: "Corriger les paiements", href: "/admin?tab=payment-settings" },
  OPEN_PAYMENT_REVIEW: { label: "Revue paiements", href: "/admin?tab=payments" },
  OPEN_ORDERS: { label: "Voir les commandes", href: "/admin?tab=orders" },
  OPEN_ORDER_DETAIL: {
    label: "Voir la commande",
    href: (c) => (c?.orderId ? `/admin/orders/${c.orderId}` : "/admin?tab=orders"),
  },
  OPEN_REFUNDS: { label: "Ouvrir les remboursements", href: "/admin/refunds" },
  OPEN_SUPPORT: { label: "Ouvrir le support", href: "/admin?tab=support" },
  OPEN_FULFILLMENT_TEST: { label: "Lancer le test", href: "/admin/operations/fulfillment-test" },
  OPEN_PRODUCTS: { label: "Voir les produits", href: "/admin?tab=products" },
  OPEN_EMAIL_HEALTH: { label: "Vérifier les e-mails", href: "/admin?tab=email-templates" },
  OPEN_ACTIVITY: { label: "Voir l'activité", href: "/admin/operations" },
  OPEN_OVERVIEW: { label: "Vue d'ensemble", href: "/admin" },
};

export const ALL_ACTION_IDS = Object.keys(REGISTRY) as ActionId[];

export function isActionId(x: unknown): x is ActionId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, x);
}

/** Resolve a single approved id to a labelled, real-href action. */
export function resolveAction(id: ActionId, primary: boolean, candidate?: CandidateIssue): CeoBriefingActionDTO {
  const def = REGISTRY[id];
  const href = typeof def.href === "function" ? def.href(candidate) : def.href;
  return { actionId: id, label: def.label, href, primary };
}

/**
 * Resolve up to two actions (first = primary). Unknown ids are dropped. If none
 * survive, falls back to the candidate's own allowed actions, then to the
 * overview — so the card always has at least one valid CTA.
 */
export function resolveActions(
  ids: (ActionId | null | undefined)[],
  candidate?: CandidateIssue,
): CeoBriefingActionDTO[] {
  const valid: ActionId[] = [];
  for (const id of ids) {
    if (id && isActionId(id) && !valid.includes(id)) valid.push(id);
  }
  if (valid.length === 0 && candidate) {
    for (const id of candidate.allowedActionIds) {
      if (!valid.includes(id)) valid.push(id);
    }
  }
  if (valid.length === 0) valid.push("OPEN_OVERVIEW");
  return valid.slice(0, 2).map((id, i) => resolveAction(id, i === 0, candidate));
}
