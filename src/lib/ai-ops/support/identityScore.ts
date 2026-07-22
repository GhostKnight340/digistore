/**
 * Identity candidate scoring — PURE (no DB), unit-testable.
 *
 * The resolvers in identity.ts each emit scored candidates; this aggregates them
 * into a single decision: the best customer/order match, how many orders the
 * person has, and whether we're confident enough to skip asking the customer.
 */

export interface IdentityCandidate {
  customerId: string | null;
  orderId: string | null;
  /** 0..1 — how strongly this signal identifies the customer/order. */
  confidence: number;
  via: string;
}

export interface ResolvedIdentity {
  identified: boolean;
  customerId: string | null;
  orderId: string | null;
  ordersFound: number;
  via: string[];
}

const HIGH_CONFIDENCE = 0.8;

export function aggregateIdentity(candidates: IdentityCandidate[]): ResolvedIdentity {
  const bestWith = (pick: (c: IdentityCandidate) => string | null): string | null => {
    let best: IdentityCandidate | null = null;
    for (const c of candidates) {
      if (!pick(c)) continue;
      if (!best || c.confidence > best.confidence) best = c;
    }
    return best ? pick(best) : null;
  };

  const customerId = bestWith((c) => c.customerId);
  const orderId = bestWith((c) => c.orderId);
  const via = [...new Set(candidates.map((c) => c.via))];

  // Orders known to belong to this person, encoded by the order_email resolver
  // as "order_email(N)".
  const orderEmailVia = via.find((v) => v.startsWith("order_email"));
  const ordersFound = orderEmailVia ? Number(orderEmailVia.match(/\((\d+)\)/)?.[1] ?? 0) : orderId ? 1 : 0;

  // Confident when one strong signal matches, OR two independent signals agree —
  // so a guest with orders under their email is identified without an account.
  const distinctStrongSignals = new Set(
    candidates.filter((c) => c.confidence >= 0.5).map((c) => c.via.replace(/\(.*\)/, "")),
  ).size;
  const maxConfidence = candidates.reduce((m, c) => Math.max(m, c.confidence), 0);
  const identified = (!!customerId || !!orderId) && (maxConfidence >= HIGH_CONFIDENCE || distinctStrongSignals >= 2);

  return { identified, customerId, orderId, ordersFound, via };
}
