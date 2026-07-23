"use server";

import {
  createOrder,
  customerOwnsOrder,
  emailHasRegisteredAccount,
  getCustomerOrder,
  getOrderOwnership,
  getOrderSummaries,
  findOrderByEmailAndId,
} from "@/lib/db/orders";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";
import { getCheckoutSessionId, hasVerifiedProof } from "@/lib/checkout/emailVerification";
import { getCurrentCustomer } from "@/lib/auth";
import { customerOrderRedirectPath } from "@/lib/orderNumber";
import { logSecurityEvent } from "@/lib/db/securityLog";
import { POLICIES, clientIp, consume, dim } from "@/lib/rateLimit";
import type { CustomerOrderDTO } from "@/lib/dto";

/** Checkout: create a pending order in the database. Returns the new order id. */
export async function createOrderAction(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  /** Optional: the customer picks the actual method on the payment page. */
  paymentMethod?: string;
  items: { productId: string; quantity: number }[];
  /** Optional promo code applied at checkout (re-validated server-side). */
  promoCode?: string;
  /** Optional Ghost Credit (whole MAD) to spend (re-capped server-side). */
  ghostCreditToApplyMad?: number;
}): Promise<
  | {
      id: string;
      publicOrderNumber: string;
      publicOrderPathSegment: string;
      accessToken: string | null;
    }
  // Customer-safe French message. `accountExists` additionally tells the client
  // to surface a "Se connecter" path rather than a bare error.
  | { error: string; accountExists?: boolean }
  | null
> {
  // Global pre-launch guard: never create an order while ordering is disabled.
  // The DB layer re-checks this too, so a race or a direct call can't slip
  // through (see createOrder in src/lib/db/orders.ts).
  if (!(await isOrderingCurrentlyEnabled())) return null;

  const customer = await getCurrentCustomer();

  // Rate limited on BOTH dimensions because guest checkout makes this reachable
  // without a session: the IP budget bounds a single abusive source, the e-mail
  // budget bounds someone rotating IPs against one address. A tripped limit
  // returns the same generic French message as any other failure.
  const { allowed } = await consume([
    dim("order-create:ip", await clientIp(), POLICIES.orderCreateIp),
    dim(
      "order-create:email",
      (customer?.email ?? input.customerEmail).trim().toLowerCase(),
      POLICIES.orderCreateEmail,
    ),
  ]);
  if (!allowed) {
    return { error: "Trop de tentatives. Patientez quelques minutes puis réessayez." };
  }

  // ── Authenticated customer ────────────────────────────────────────────────
  if (customer) {
    if (!customer.emailVerified) {
      return { error: "Vérifiez votre adresse e-mail pour continuer vers le paiement." };
    }
    return createOrder(input);
  }

  // ── Guest checkout ────────────────────────────────────────────────────────
  // Guests are supported deliberately: forcing account creation to buy a gift
  // card costs real orders. What a guest still must prove is CONTROL OF THE
  // E-MAIL, because the order — and the token that later reveals the delivered
  // codes — is delivered there, and because createOrder attaches the order to
  // whatever Customer row holds that address. Without this check, anyone could
  // place orders against a stranger's e-mail. The proof is the same six-digit
  // code flow the register path already uses; it is NOT consumed here, so a
  // guest can place a second order, and a retry of this one, without
  // re-verifying.
  const guestName = input.customerName.trim();
  const guestEmail = input.customerEmail.trim().toLowerCase();
  if (guestName.length < 2) {
    return { error: "Veuillez saisir votre nom complet." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return { error: "Veuillez saisir une adresse e-mail valide." };
  }

  const sessionId = await getCheckoutSessionId();
  if (!sessionId || !(await hasVerifiedProof(guestEmail, sessionId))) {
    return { error: "Vérifiez votre adresse e-mail pour continuer vers le paiement." };
  }

  // An address that already has a real (password or OAuth) account belongs to a
  // customer who should sign in: it keeps the order in their history, their
  // Ghost Credit spendable, and avoids a second half-populated profile. This is
  // a routing hint, not an access decision — the caller renders a "Se connecter"
  // link. It only ever fires for an address the caller has just PROVEN they
  // control, so it discloses nothing to a stranger.
  if (await emailHasRegisteredAccount(guestEmail)) {
    return {
      error:
        "Un compte existe déjà avec cette adresse. Connectez-vous pour finaliser votre commande.",
      accountExists: true,
    };
  }

  return createOrder(input);
}

/** Customer: fetch a single order with its delivered codes. */
export async function getCustomerOrderAction(
  id: string,
): Promise<CustomerOrderDTO | null> {
  return getCustomerOrder(id);
}

/** Customer: fetch summaries for the order ids remembered by this browser. */
export async function getMyOrdersAction(
  ids: string[],
): Promise<CustomerOrderDTO[]> {
  return getOrderSummaries(ids);
}

/**
 * Minimum wall-clock time findOrderAction takes, whatever the outcome. A hit
 * does strictly more work than a miss (token read + path build), and a
 * rate-limited call does almost none, so without a floor the response time
 * alone tells an attacker which order numbers exist. Padding every outcome to
 * the same floor removes the coarse signal.
 */
const LOOKUP_FLOOR_MS = 400;

async function padTo(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < LOOKUP_FLOOR_MS) {
    await new Promise((resolve) => setTimeout(resolve, LOOKUP_FLOOR_MS - elapsed));
  }
}

/**
 * Customer: look up an order by public number + the email used at checkout.
 * Falls back to the internal ID for legacy support links.
 *
 * This is a public endpoint that, on a hit, returns a redirect carrying the
 * order's `deliveryToken` — which grants the full order PII and any delivered
 * gift-card codes. Public order numbers are sequential, so the email address is
 * the guest's shared secret.
 *
 * Defenses, layered:
 *   - DURABLE rate limiting (Upstash Redis, Postgres fallback) on BOTH the source
 *     IP and the submitted email, shared across serverless instances.
 *   - An ESCALATING penalty budget charged only on failed/unauthorized attempts,
 *     so scripted enumeration is throttled hard while honest typos are fine.
 *   - A logged-in customer may ONLY resolve orders that belong to their account,
 *     even with a correct number+email for someone else's order.
 *   - Every failure mode (no such order / wrong email / unauthorized / rate
 *     limited) returns the IDENTICAL `{ found: false }` with the same timing pad,
 *     so the response is never an existence oracle and no order/customer/payment
 *     data is disclosed before authorization succeeds.
 *   - Suspicious attempts are recorded to SecurityEvent, with Discord escalation.
 */
export async function findOrderAction(
  orderNumber: string,
  email: string,
): Promise<{ found: boolean; id?: string; redirectTo?: string }> {
  const startedAt = Date.now();
  const normalizedEmail = email.trim().toLowerCase();
  const ip = await clientIp();
  const customer = await getCurrentCustomer();

  // Charge the escalating failure budget + record the event. Shared helper so
  // every failure path is uniform (identical response, same audit trail).
  const fail = async (kind: Parameters<typeof logSecurityEvent>[0]["kind"]) => {
    if (kind !== "order_lookup_ratelimited") {
      await consume([
        dim("order-lookup-fail:ip", ip, POLICIES.orderLookupFailIp),
        dim("order-lookup-fail:email", normalizedEmail, POLICIES.orderLookupFailEmail),
      ]);
    }
    await logSecurityEvent({
      kind,
      ip,
      identifier: normalizedEmail,
      metadata: { orderNumber: orderNumber.trim().slice(0, 32) },
    });
    await padTo(startedAt);
    return { found: false as const };
  };

  const { allowed } = await consume([
    dim("order-lookup:ip", ip, POLICIES.orderLookupIp),
    dim("order-lookup:email", normalizedEmail, POLICIES.orderLookupEmail),
  ]);
  if (!allowed) return fail("order_lookup_ratelimited");

  const order = await findOrderByEmailAndId(orderNumber.trim(), normalizedEmail);
  if (!order) return fail("order_lookup_failed");

  // Logged-in customers are confined to their own orders: knowing another
  // customer's number+email is not enough while authenticated.
  if (customer) {
    const owner = await getOrderOwnership(order.id);
    if (!owner || !customerOwnsOrder(customer, owner)) {
      return fail("order_lookup_unauthorized");
    }
  }

  // Route via the secret per-order token whenever one exists (the email match
  // already authenticated the guest): it authorizes the payment/order pages and
  // guest order actions, and reveals codes once delivered. Only legacy rows
  // without a token fall back to the public path segment.
  const segment = order.deliveryToken ?? order.publicOrderPathSegment;
  await padTo(startedAt);
  return {
    found: true,
    id: order.id,
    redirectTo: customerOrderRedirectPath(order.status, segment),
  };
}
