/**
 * Reason codes for the GA4 `checkout_error` event.
 *
 * Pure and dependency-free so it can be unit-tested without pulling in the
 * checkout client component (the test runner uses `--conditions=react-server`
 * and cannot load `next/link`).
 *
 * Why a fixed vocabulary rather than the server's message: the messages are
 * French prose that can embed catalogue detail ("L'article « … » n'est plus
 * disponible"), and free text in an analytics property is how PII and business
 * data leak by accident. Codes also make the funnel groupable in GA4, which raw
 * strings never are.
 */

/** Every value `classifyCheckoutError` can return. The vocabulary is closed. */
export const CHECKOUT_ERROR_REASONS = [
  "empty_cart",
  "item_unavailable",
  "payment_method_unavailable",
  "invalid_quantity",
  "invalid_phone",
  "account_exists",
  "email_unverified",
  "rate_limited",
  "promo_rejected",
  "other",
] as const;

export type CheckoutErrorReason = (typeof CHECKOUT_ERROR_REASONS)[number];

/**
 * Maps a customer-facing server error to a stable, non-identifying reason code.
 * Anything unrecognised degrades to `"other"` — never to the message itself.
 */
export function classifyCheckoutError(message: string): CheckoutErrorReason {
  const text = message.toLowerCase();
  if (text.includes("panier est vide")) return "empty_cart";
  if (text.includes("plus disponible")) return "item_unavailable";
  if (text.includes("moyen de paiement")) return "payment_method_unavailable";
  if (text.includes("quantité")) return "invalid_quantity";
  if (text.includes("téléphone")) return "invalid_phone";
  if (text.includes("compte existe")) return "account_exists";
  if (text.includes("vérifiez votre adresse")) return "email_unverified";
  if (text.includes("trop de tentatives")) return "rate_limited";
  if (text.includes("promo") || text.includes("code")) return "promo_rejected";
  return "other";
}
