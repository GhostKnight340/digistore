/**
 * Certainty classification for a failed supplier PURCHASE call.
 *
 * The distinction that matters on the money path is not "did it fail?" but
 * "do we know whether the supplier charged us?":
 *
 *  - CLEAN     — the supplier definitively rejected the request before doing
 *                any work (validation error, insufficient balance, any 4xx).
 *                No wallet spend happened; retrying is safe.
 *  - UNCERTAIN — the request may well have been received and processed while
 *                the response was lost: a timeout/abort, a socket error, a
 *                5xx, or anything we cannot positively identify. Retrying
 *                risks a SECOND real purchase.
 *
 * Reloadly makes this critical: its `customIdentifier` is a free-form
 * reference field, not a server-enforced dedupe key, so a blind retry after a
 * timeout genuinely buys a second gift card. An UNCERTAIN outcome must reach
 * the admin as an explicit "reconcile manually before retrying" instruction,
 * never as an ordinary "ça a échoué, réessayez".
 *
 * Deliberately pure and dependency-free (no server-only, no provider imports)
 * so both providers and the tests can use it.
 */

export type SupplierFailureCertainty = "clean" | "uncertain";

/**
 * A purchase whose outcome could not be determined. Thrown by a provider in
 * place of a plain Error so deliverOrder can surface the manual-reconciliation
 * path instead of an ordinary retryable failure.
 */
export class SupplierPurchaseUncertainError extends Error {
  /** Reference the admin should search for in the supplier dashboard. */
  reconciliationRef: string;
  constructor(message: string, reconciliationRef: string) {
    super(message);
    this.name = "SupplierPurchaseUncertainError";
    this.reconciliationRef = reconciliationRef;
  }
}

export function isSupplierPurchaseUncertain(error: unknown): boolean {
  return error instanceof SupplierPurchaseUncertainError;
}

/**
 * Classifies a failure raised by an order-placement call.
 *
 * `isNetworkError` comes from the provider's own detector (timeout, abort,
 * DNS/socket failure — i.e. no HTTP response ever arrived). `status` is the
 * HTTP status when one did arrive, or null when it did not.
 */
export function classifyPurchaseFailure(input: {
  isNetworkError: boolean;
  status: number | null;
}): SupplierFailureCertainty {
  // No response at all: the request may still have reached the supplier.
  if (input.isNetworkError) return "uncertain";
  if (input.status == null) return "uncertain";
  // 408 Request Timeout / 425 Too Early are server-side "we may have started".
  if (input.status === 408 || input.status === 425) return "uncertain";
  // The supplier answered and refused before spending: safe to retry.
  if (input.status >= 400 && input.status < 500) return "clean";
  // 5xx (and anything non-2xx we don't recognise): the order may have landed.
  if (input.status >= 500) return "uncertain";
  return "uncertain";
}

/**
 * French, admin-facing copy for an UNCERTAIN purchase. Deliberately tells the
 * admin what to do BEFORE touching "Livrer" again — a second click is a second
 * real charge on suppliers without server-enforced idempotency.
 */
export function uncertainPurchaseMessage(input: {
  supplierName: string;
  reconciliationRef: string;
  detail: string;
}): string {
  return (
    `Commande ${input.supplierName} au statut INCERTAIN : ${input.detail} ` +
    `La commande a peut-être été passée et débitée malgré l’erreur. ` +
    `NE RELANCEZ PAS la livraison avant vérification : ouvrez le tableau de bord ${input.supplierName}, ` +
    `recherchez la référence « ${input.reconciliationRef} », puis livrez le code manuellement s’il existe. ` +
    `Ne réessayez que si aucune commande ne correspond.`
  );
}
