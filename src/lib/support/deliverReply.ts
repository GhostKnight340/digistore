/**
 * Support reply delivery core (server-only, NO admin-auth gate).
 *
 * The one place a support reply is actually delivered: it records the reply on
 * the ticket (flipping it to "answered"), posts it into the Discord thread, and
 * emails the customer. Extracted from the admin action so BOTH surfaces share
 * one path:
 *   - a human admin reply (src/app/actions/supportAdmin.ts, gated by an admin session)
 *   - an AI auto-send under an authorizing coverage session (no admin session;
 *     the coverage-session gate is the authority — re-validated before calling this)
 *
 * Because this has no auth of its own, callers MUST establish authority first.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  addSupportTicketReply,
  supportTicketAdminDTO,
  type SupportTicketAdminDTO,
  type SupportTicketRecord,
} from "@/lib/db/supportTickets";
import { notifySupportTicketReply, type SupportTicketCardInput } from "@/lib/discord/notify";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { findSupportCategory } from "@/lib/support/config";
import type { EmailTemplateKey } from "@/lib/emailTemplates";

export const MAX_REPLY_LENGTH = 4000;

/** The admin dashboard shows support under a tab, so the card links back there. */
export function supportAdminUrl(): string {
  return absoluteAppUrl("/admin");
}

/** Customer-facing tracking page (reference + email) used in reply/close emails. */
export function supportTrackingUrl(): string {
  return absoluteAppUrl("/support/suivi");
}

export function feedbackUrl(token: string | null): string {
  return token ? absoluteAppUrl(`/support/feedback?token=${token}`) : supportTrackingUrl();
}

export function cardInput(ticket: SupportTicketRecord): SupportTicketCardInput {
  return {
    ticketId: ticket.id,
    reference: ticket.reference,
    categoryLabel: findSupportCategory(ticket.category)?.label ?? ticket.category,
    subIssueLabel: ticket.subIssueLabel,
    orderRef: ticket.orderRef,
    name: ticket.name,
    email: ticket.email,
    status: ticket.status,
    resolution: ticket.resolution,
    adminUrl: supportAdminUrl(),
    discordMessageId: ticket.discordMessageId,
    discordThreadId: ticket.discordThreadId,
  };
}

/** Threading options for a support email (preserve the customer's email thread). */
export interface SupportEmailThreading {
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

/** Send a support email off the stored template. Never throws — email delivery
 *  must never fail the caller (same contract as the order emails). */
export async function sendSupportEmail(
  ticket: SupportTicketRecord,
  templateKey: EmailTemplateKey,
  variables: Record<string, string>,
  threading?: SupportEmailThreading,
): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: ticket.email,
      customerId: ticket.customerId,
      templateKey,
      type: templateKey,
      variables: { customer_name: ticket.name, reference: ticket.reference, ...variables },
      subject: threading?.subject,
      messageId: threading?.messageId,
      inReplyTo: threading?.inReplyTo,
      references: threading?.references,
    });
  } catch (error) {
    console.error(`[support:email:${templateKey}]`, error instanceof Error ? error.message : error);
  }
}

/** A stable RFC 5322 Message-ID for an outbound reply on this ticket. */
function ghostMessageId(reference: string): string {
  return `<ghost-${reference}-${randomUUID()}@ghost.ma>`;
}

/** Consistent subject carrying the ticket number so replies stay in one thread. */
function threadSubject(reference: string): string {
  return `Votre demande de support ${reference}`;
}

export interface DeliverReplyResult {
  ok: boolean;
  error?: string;
  ticket?: SupportTicketAdminDTO;
}

/**
 * Deliver one reply to the customer (DB + Discord + email). Authority must be
 * established by the caller. Returns a typed result; never throws.
 */
export async function deliverSupportReply(id: string, body: string): Promise<DeliverReplyResult> {
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "La réponse ne peut pas être vide." };

  let ticket: SupportTicketRecord;
  try {
    ticket = await addSupportTicketReply(id, text.slice(0, MAX_REPLY_LENGTH));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Réponse impossible." };
  }

  void notifySupportTicketReply({ ...cardInput(ticket), replyBody: text.slice(0, MAX_REPLY_LENGTH) });

  // Thread the reply into the customer's email conversation: In-Reply-To the
  // originating inbound email, extend the References chain, and set a stable
  // Message-ID so the customer's next reply maps back to this ticket.
  const outboundId = ghostMessageId(ticket.reference);
  const references =
    [ticket.emailReferences, ticket.emailMessageId, ticket.lastOutboundEmailId].filter(Boolean).join(" ") || undefined;
  await sendSupportEmail(
    ticket,
    "support_reply",
    { reason: text.slice(0, MAX_REPLY_LENGTH), support_url: supportTrackingUrl() },
    {
      subject: threadSubject(ticket.reference),
      messageId: outboundId,
      inReplyTo: ticket.emailMessageId ?? undefined,
      references,
    },
  );

  // Record the outbound id so the next reply continues the same References chain.
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      lastOutboundEmailId: outboundId,
      emailReferences: [references, outboundId].filter(Boolean).join(" ").slice(0, 3000),
    },
  });

  return { ok: true, ticket: supportTicketAdminDTO(ticket) };
}
