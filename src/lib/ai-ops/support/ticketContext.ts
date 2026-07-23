/**
 * Shared ticket context resolution (server-only).
 *
 * Resolves WHO the customer is and WHICH order they mean from a ticket, then
 * fetches the grounded business context (order details + customer history) via
 * the safe tool layer. Used by BOTH the coverage pipeline and the manual
 * per-conversation assist tools, so the AI always has the referenced order's
 * status — not just the customer's recent-order history.
 */

import "server-only";

import { callTool } from "../tools/service";
import { SUPPORT_ASSISTANT_MODULE } from "./module";
import { extractIdentitySignals } from "./identitySignals";
import { resolveIdentity, type ResolvedIdentity } from "./identity";

export interface TicketContextInput {
  email: string;
  orderRef: string | null;
  phone: string | null;
  /** The customer's own message text (first message + their replies). */
  text: string;
}

export interface TicketContext {
  identity: ResolvedIdentity;
  /** getCustomerHistory result (redacted), or null. */
  customer: unknown;
  /** getOrderDetails for the referenced order (redacted), or null. */
  order: unknown;
}

export async function resolveTicketContext(
  input: TicketContextInput,
  executionId: string | null,
): Promise<TicketContext> {
  const signals = extractIdentitySignals({ email: input.email, orderRef: input.orderRef, phone: input.phone, text: input.text });
  const identity = await resolveIdentity(signals);

  const [customerRes, orderRes] = await Promise.all([
    identity.customerId
      ? callTool({ module: SUPPORT_ASSISTANT_MODULE, tool: "getCustomerHistory", input: { customerId: identity.customerId }, executionId })
      : Promise.resolve(null),
    identity.orderId
      ? callTool({ module: SUPPORT_ASSISTANT_MODULE, tool: "getOrderDetails", input: { orderId: identity.orderId }, executionId })
      : Promise.resolve(null),
  ]);

  return {
    identity,
    customer: customerRes?.ok ? customerRes.data : null,
    order: orderRes?.ok ? orderRes.data : null,
  };
}

/** Build the customer-only message text from a ticket's first message + replies. */
export function customerMessageText(
  firstMessage: string | null,
  replies: { author: string; body: string }[],
): string {
  return [firstMessage, ...replies.filter((r) => r.author === "customer").map((r) => r.body)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
}
