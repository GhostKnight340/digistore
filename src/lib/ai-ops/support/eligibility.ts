/**
 * Ticket eligibility gate (pure) — the Customer Support AI only takes ownership
 * of tickets tied to an actual PURCHASING relationship. Pre-purchase, partner,
 * supplier, job, marketing, spam, and unrelated messages are routed to manual
 * review instead of being auto-handled.
 *
 * Three outcomes:
 *   - eligible    : there's a clear purchasing link → run the normal workflow.
 *   - needs_info  : plausibly a buyer but unmatched → the AI may send ONE concise
 *                   request for an order number / purchase email / payment ref.
 *   - route_manual: no purchasing signal / out of scope → hand to a human.
 */

export type Eligibility = "eligible" | "needs_info" | "route_manual";

/** Post-purchase support categories (from src/lib/support/config.ts keys). */
const POST_PURCHASE = new Set(["paiement", "livraison", "code", "commande", "remboursement", "compte", "technique"]);

export interface EligibilityInput {
  orderRef: string | null;
  customerId: string | null;
  category: string;
  /** Number of orders the matched customer has (0 if no/unknown customer). */
  ordersTotal: number;
}

export function assessEligibility(input: EligibilityInput): Eligibility {
  // A concrete purchasing link → eligible.
  if (input.orderRef || input.customerId || input.ordersTotal > 0) return "eligible";
  // No link, but a post-purchase category → probably a buyer we just can't match.
  if (POST_PURCHASE.has(input.category)) return "needs_info";
  // No link and a general/other category → let a human triage (pre-purchase/spam/etc.).
  return "route_manual";
}

/** The single concise request sent when a likely buyer can't be matched. */
export const CLARIFY_MESSAGE =
  "Bonjour, je ne trouve pas de commande liée à cette adresse e-mail. " +
  "Merci de répondre avec votre numéro de commande ou l'adresse e-mail utilisée lors de l'achat.";
