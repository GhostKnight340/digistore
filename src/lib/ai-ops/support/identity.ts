/**
 * Customer / order identity resolution (server-only).
 *
 * Correlates a support ticket to a customer and/or order using MULTIPLE signals,
 * so a GUEST checkout (no linked account) is identified just as well as a
 * registered one — orders correlate by `customerEmail` even with no `customerId`.
 *
 * Design: a REGISTRY of independent resolvers, each producing scored candidates.
 * The AI workflow calls `resolveIdentity(signals)` and never needs to know the
 * resolvers — adding a new identifier is just pushing one entry to RESOLVERS.
 * The pipeline exhausts this BEFORE asking the customer for anything.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveOrderReference } from "@/lib/db/orders";
import type { IdentitySignals } from "./identitySignals";
import { aggregateIdentity, type IdentityCandidate, type ResolvedIdentity } from "./identityScore";

export type { IdentityCandidate, ResolvedIdentity };

interface Resolver {
  key: string;
  run: (s: IdentitySignals) => Promise<IdentityCandidate[]>;
}

const EMAIL = (email: string) => ({ equals: email, mode: "insensitive" as const });

/** A registered account with this email. */
const customerByEmail: Resolver = {
  key: "customer_email",
  run: async (s) => {
    if (!s.senderEmail) return [];
    const c = await prisma.customer.findFirst({ where: { email: EMAIL(s.senderEmail) }, select: { id: true } });
    return c ? [{ customerId: c.id, orderId: null, confidence: 0.9, via: "customer_email" }] : [];
  },
};

/** Orders placed with this email — the guest-checkout path (no account needed). */
const ordersByEmail: Resolver = {
  key: "order_email",
  run: async (s) => {
    if (!s.senderEmail) return [];
    const orders = await prisma.order.findMany({
      where: { customerEmail: EMAIL(s.senderEmail) },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, customerId: true },
    });
    if (orders.length === 0) return [];
    const latest = orders[0];
    // Confidence scales a little with how clearly this email "owns" orders.
    return [{ customerId: latest.customerId, orderId: latest.id, confidence: 0.85, via: `order_email(${orders.length})` }];
  },
};

/** An order number quoted in the message → the order (cross-checked vs sender). */
const orderByNumber: Resolver = {
  key: "order_number",
  run: async (s) => {
    const out: IdentityCandidate[] = [];
    for (const ref of s.orderRefs.slice(0, 4)) {
      const orderId = await resolveOrderReference(ref);
      if (!orderId) continue;
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true, customerEmail: true } });
      if (!order) continue;
      const emailMatches = s.senderEmail && order.customerEmail.toLowerCase() === s.senderEmail;
      out.push({ customerId: order.customerId, orderId: order.id, confidence: emailMatches ? 0.95 : 0.7, via: "order_number" });
    }
    return out;
  },
};

/** A payment provider reference quoted in the message → the order. */
const orderByPaymentRef: Resolver = {
  key: "payment_ref",
  run: async (s) => {
    if (s.paymentRefs.length === 0) return [];
    const orders = await prisma.order.findMany({
      where: { OR: [{ paymentProviderOrderId: { in: s.paymentRefs } }, { paymentProviderCaptureId: { in: s.paymentRefs } }] },
      select: { id: true, customerId: true },
      take: 3,
    });
    return orders.map((o) => ({ customerId: o.customerId, orderId: o.id, confidence: 0.9, via: "payment_ref" }));
  },
};

/** Prior support tickets from this email that already carry an identity. */
const ticketHistoryByEmail: Resolver = {
  key: "ticket_history",
  run: async (s) => {
    if (!s.senderEmail) return [];
    const prior = await prisma.supportTicket.findFirst({
      where: { email: EMAIL(s.senderEmail), customerId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { customerId: true },
    });
    return prior?.customerId ? [{ customerId: prior.customerId, orderId: null, confidence: 0.6, via: "ticket_history" }] : [];
  },
};

/** A registered account with this phone number. */
const customerByPhone: Resolver = {
  key: "phone",
  run: async (s) => {
    if (!s.phone) return [];
    const digits = s.phone.replace(/\D/g, "").slice(-9); // last 9 digits (local part)
    if (digits.length < 8) return [];
    const c = await prisma.customer.findFirst({ where: { phone: { contains: digits } }, select: { id: true } });
    return c ? [{ customerId: c.id, orderId: null, confidence: 0.6, via: "phone" }] : [];
  },
};

/** The registry. Append a resolver here to add an identifier — nothing else changes. */
export const RESOLVERS: Resolver[] = [
  customerByEmail,
  ordersByEmail,
  orderByNumber,
  orderByPaymentRef,
  ticketHistoryByEmail,
  customerByPhone,
];

/**
 * Resolve identity from all signals by running every resolver and aggregating
 * (pure) into a single decision. A guest with orders under their email is
 * identified without an account. A resolver that throws is ignored.
 */
export async function resolveIdentity(signals: IdentitySignals): Promise<ResolvedIdentity> {
  const results = await Promise.all(RESOLVERS.map((r) => r.run(signals).catch(() => [] as IdentityCandidate[])));
  return aggregateIdentity(results.flat());
}
