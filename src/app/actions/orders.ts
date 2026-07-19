"use server";

import {
  createOrder,
  getCustomerOrder,
  getOrderSummaries,
  findOrderByEmailAndId,
} from "@/lib/db/orders";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";
import { getCurrentCustomer } from "@/lib/auth";
import { customerOrderRedirectPath } from "@/lib/orderNumber";
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
  | { error: string }
  | null
> {
  // Global pre-launch guard: never create an order while ordering is disabled.
  // The DB layer re-checks this too, so a race or a direct call can't slip
  // through (see createOrder in src/lib/db/orders.ts).
  if (!(await isOrderingCurrentlyEnabled())) return null;

  // Account required: anonymous guest checkout is removed. Only an authenticated,
  // email-verified customer may create an order through this path. New customers
  // register + verify inline and use registerAndCreateOrderAction instead. This
  // is the server-side backstop — the disabled button is never the only guard.
  const customer = await getCurrentCustomer();
  if (!customer) {
    return { error: "Veuillez créer un compte ou vous connecter pour continuer." };
  }
  if (!customer.emailVerified) {
    return { error: "Vérifiez votre adresse e-mail pour continuer vers le paiement." };
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
 * This is an UNAUTHENTICATED endpoint that, on a hit, returns a redirect
 * carrying the order's `deliveryToken` — which grants the full order PII and any
 * delivered gift-card codes. Public order numbers are sequential, so the email
 * address is the only secret. It is therefore rate limited on BOTH the source IP
 * and the submitted email, and every failure mode (no such order / wrong email /
 * rate limited) returns the identical `{ found: false }` so the response cannot
 * be used as an existence oracle. The caller renders one generic French message
 * for all of them.
 *
 * Caveat: the limiter is per serverless instance (see src/lib/rateLimitCore),
 * so this raises the cost of enumeration rather than preventing it outright.
 * Requiring an authenticated session here would close the hole properly, but
 * Order.customerId is nullable — legacy guest orders still depend on this path.
 */
export async function findOrderAction(
  orderNumber: string,
  email: string,
): Promise<{ found: boolean; id?: string; redirectTo?: string }> {
  const startedAt = Date.now();
  const normalizedEmail = email.trim().toLowerCase();

  const { allowed } = consume([
    dim("order-lookup:ip", await clientIp(), POLICIES.orderLookupIp),
    dim("order-lookup:email", normalizedEmail, POLICIES.orderLookupEmail),
  ]);
  if (!allowed) {
    await padTo(startedAt);
    return { found: false };
  }

  const order = await findOrderByEmailAndId(orderNumber.trim(), normalizedEmail);
  if (!order) {
    await padTo(startedAt);
    return { found: false };
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
