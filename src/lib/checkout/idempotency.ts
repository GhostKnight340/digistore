/**
 * Duplicate-order protection for checkout.
 *
 * The failure this prevents is ordinary and expensive: the customer double-taps
 * "Passer au paiement", or their connection drops after the server committed the
 * order but before the response arrived, and they retry. Previously the only
 * guard was a client-side disabled button — which does nothing for a retry, a
 * refresh, or a second tab — so each attempt created a real order with its own
 * payment token, and the customer could pay twice.
 *
 * The approach is a *natural-key* match rather than a stored idempotency key,
 * because it needs no schema change: an order that is still unpaid, belongs to
 * the same customer, was created moments ago, and contains exactly the same
 * lines for exactly the same total IS the order the retry is trying to create.
 * Returning it is both correct and safe — nothing is mutated, and the customer
 * lands on the payment page for the order that already exists.
 *
 * Deliberate limits:
 *  - Only `pending_payment` orders match. Once a customer has submitted proof or
 *    been confirmed, a fresh identical order is a genuine second purchase.
 *  - The window is short (see {@link IDEMPOTENCY_WINDOW_MS}). Beyond it, an
 *    identical basket is treated as a real re-order.
 *  - This narrows the duplicate window rather than making creation atomic. Two
 *    genuinely simultaneous requests can still both miss the lookup; closing
 *    that needs a unique constraint on a stored key (deferred — needs a
 *    migration; see docs/launch-readiness-audit.md).
 *
 * Everything here is pure so it can be unit-tested without a database.
 */

/**
 * How recently an unpaid, identical order must have been created to count as
 * "the same order being retried" rather than a deliberate second purchase.
 * Ten minutes comfortably covers a double-tap, a retry after a timeout, and a
 * back-button resubmit, while staying well under the time a customer would take
 * to decide they want another one.
 */
export const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

/** One line, reduced to the fields that identify what was ordered. */
export interface SignatureLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/**
 * A stable, order-independent fingerprint of a set of cart lines.
 *
 * Sorted so that cart ordering cannot make two identical baskets look different,
 * and quantities are folded per key so `2×A` and `A + A` produce the same
 * signature — the client may send either.
 */
export function orderSignature(lines: SignatureLine[]): string {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const key = `${line.productId}:${line.variantId ?? ""}`;
    totals.set(key, (totals.get(key) ?? 0) + line.quantity);
  }
  return [...totals.entries()]
    .map(([key, quantity]) => `${key}×${quantity}`)
    .sort()
    .join("|");
}

/** An existing order, reduced to what the duplicate check needs. */
export interface CandidateOrder {
  id: string;
  status: string;
  /** The amount owed AFTER any promo discount and Ghost Credit spend. */
  totalMad: number;
  discountMad: number;
  ghostCreditAppliedMad: number;
  createdAt: Date;
  items: SignatureLine[];
}

/**
 * Is this request eligible for duplicate collapsing at all?
 *
 * A promo discount and a Ghost Credit spend are both resolved *inside* the
 * order-creation transaction — the server re-validates the code and re-caps the
 * spend against the live wallet — so the amount finally owed is not knowable
 * beforehand. Collapsing such a request onto an earlier order therefore risks
 * handing the customer an order whose total does not reflect what they just
 * asked for, which is worse than the duplicate we are trying to prevent.
 *
 * So these requests fall through to normal creation, exactly as before this
 * guard existed — no regression, and single-use promo codes have their own
 * atomic reservation that surfaces a real error on a second attempt. The plain
 * basket, which is the overwhelming majority of double-taps, is fully covered.
 */
export function isIdempotencyEligible(request: {
  promoCode?: string | null;
  ghostCreditToApplyMad?: number | null;
}): boolean {
  const hasPromo = Boolean(request.promoCode?.trim());
  const hasCredit = Math.floor(request.ghostCreditToApplyMad ?? 0) > 0;
  return !hasPromo && !hasCredit;
}

/**
 * Finds the order a retry is really referring to, or null when this is a new
 * order. Callers pass the customer's own recent orders; matching requires the
 * same lines, the same money, an unpaid status, and creation inside the window.
 *
 * `subtotalMad` is the pre-discount basket value, which is what the caller knows
 * before the transaction runs. A candidate's subtotal is reconstructed as
 * `totalMad + discountMad + ghostCreditAppliedMad` (see the Order model), and
 * candidates carrying any discount or credit are rejected outright — they were
 * created from a different request shape than an eligible one (see
 * {@link isIdempotencyEligible}) and must never be collapsed onto.
 */
export function findDuplicateOrder(
  candidates: CandidateOrder[],
  request: { signature: string; subtotalMad: number },
  now: Date = new Date(),
): CandidateOrder | null {
  const cutoff = now.getTime() - IDEMPOTENCY_WINDOW_MS;
  const matches = candidates.filter((candidate) => {
    if (candidate.status !== "pending_payment") return false;
    if (candidate.discountMad !== 0 || candidate.ghostCreditAppliedMad !== 0) return false;
    if (candidate.createdAt.getTime() < cutoff) return false;
    const candidateSubtotal =
      candidate.totalMad + candidate.discountMad + candidate.ghostCreditAppliedMad;
    if (candidateSubtotal !== request.subtotalMad) return false;
    return orderSignature(candidate.items) === request.signature;
  });
  if (matches.length === 0) return null;
  // If several somehow match (a pre-existing duplicate from before this guard),
  // return the OLDEST: it is the one whose payment link the customer is most
  // likely to already hold, and it keeps the choice deterministic across retries.
  return matches.reduce((oldest, candidate) =>
    candidate.createdAt.getTime() < oldest.createdAt.getTime() ? candidate : oldest,
  );
}
