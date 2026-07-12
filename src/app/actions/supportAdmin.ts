"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listSupportTickets,
  updateSupportTicketStatus,
  addSupportTicketReply,
  closeSupportTicket,
  getSupportTicketAttachment,
  supportTicketAdminDTO,
  type SupportTicketAdminDTO,
  type SupportTicketRecord,
  type SupportTicketStatus,
  type SupportTicketResolution,
} from "@/lib/db/supportTickets";
import {
  notifySupportTicketReply,
  notifySupportTicketStatus,
  type SupportTicketCardInput,
} from "@/lib/discord/notify";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { findSupportCategory } from "@/lib/support/config";
import type { EmailTemplateKey } from "@/lib/emailTemplates";

const VALID_STATUSES: SupportTicketStatus[] = ["open", "answered", "closed"];
const VALID_RESOLUTIONS: SupportTicketResolution[] = ["resolved", "cancelled", "dismissed"];
const RESOLUTION_LABEL: Record<SupportTicketResolution, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

const MAX_REPLY_LENGTH = 4000;

/** The admin dashboard shows support under a tab, so every ticket links back to
 *  the same dashboard URL (there is no per-ticket admin route). */
function supportAdminUrl(): string {
  return absoluteAppUrl("/admin");
}

/** The customer-facing tracking page (reference + email) used in the reply /
 *  received emails; works for guests and logged-in customers alike. */
function supportTrackingUrl(): string {
  return absoluteAppUrl("/support/suivi");
}

function feedbackUrl(token: string | null): string {
  return token ? absoluteAppUrl(`/support/feedback?token=${token}`) : supportTrackingUrl();
}

function cardInput(ticket: SupportTicketRecord): SupportTicketCardInput {
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

/** Send a support email off the stored template. Never throws — email delivery
 *  must never fail an admin action (same contract as the order emails). */
async function sendSupportEmail(
  ticket: SupportTicketRecord,
  templateKey: EmailTemplateKey,
  variables: Record<string, string>,
): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: ticket.email,
      customerId: ticket.customerId,
      templateKey,
      type: templateKey,
      variables: {
        customer_name: ticket.name,
        reference: ticket.reference,
        ...variables,
      },
    });
  } catch (error) {
    console.error(`[support:email:${templateKey}]`, error instanceof Error ? error.message : error);
  }
}

export async function listSupportTicketsAction(
  filter: { status?: string } = {},
): Promise<SupportTicketAdminDTO[]> {
  await requireAdminCustomer();
  return listSupportTickets(filter);
}

/**
 * Admin reply from the dashboard: records the reply on the ticket (flipping it
 * to "answered"), posts it into the Discord thread, and emails the customer.
 */
export async function replySupportTicketAction(
  id: string,
  body: string,
): Promise<{ ok: boolean; error?: string; ticket?: SupportTicketAdminDTO }> {
  await requireAdminCustomer();
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "La réponse ne peut pas être vide." };

  let ticket: SupportTicketRecord;
  try {
    ticket = await addSupportTicketReply(id, text.slice(0, MAX_REPLY_LENGTH));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Réponse impossible." };
  }

  void notifySupportTicketReply({ ...cardInput(ticket), replyBody: text.slice(0, MAX_REPLY_LENGTH) });
  await sendSupportEmail(ticket, "support_reply", {
    reason: text.slice(0, MAX_REPLY_LENGTH),
    support_url: supportTrackingUrl(),
  });

  revalidatePath("/admin");
  return { ok: true, ticket: supportTicketAdminDTO(ticket) };
}

/**
 * Close a ticket with an optional resolution (résolu / annulé / sans suite),
 * update the Discord thread + card, and email the customer a close notice that
 * invites feedback on the support experience.
 */
export async function closeSupportTicketAction(
  id: string,
  resolution?: string | null,
): Promise<{ ok: boolean; error?: string; ticket?: SupportTicketAdminDTO }> {
  await requireAdminCustomer();
  const res =
    resolution && VALID_RESOLUTIONS.includes(resolution as SupportTicketResolution)
      ? (resolution as SupportTicketResolution)
      : null;

  let ticket: SupportTicketRecord;
  try {
    ticket = await closeSupportTicket(id, res);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Fermeture impossible." };
  }

  void notifySupportTicketStatus(cardInput(ticket));
  await sendSupportEmail(ticket, "support_closed", {
    reason: res ? RESOLUTION_LABEL[res] : "",
    feedback_url: feedbackUrl(ticket.feedbackToken),
  });

  revalidatePath("/admin");
  return { ok: true, ticket: supportTicketAdminDTO(ticket) };
}

/**
 * Non-closing status transitions (reopen, or manually marking answered). Closing
 * always routes through {@link closeSupportTicketAction} so a resolution can be
 * chosen and the feedback email is sent.
 */
export async function updateSupportTicketStatusAction(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string; ticket?: SupportTicketAdminDTO }> {
  await requireAdminCustomer();
  if (!VALID_STATUSES.includes(status as SupportTicketStatus)) {
    return { ok: false, error: "Statut invalide." };
  }
  if (status === "closed") return closeSupportTicketAction(id, null);

  try {
    const ticket = await updateSupportTicketStatus(id, status as SupportTicketStatus);
    void notifySupportTicketStatus(cardInput(ticket));
    revalidatePath("/admin");
    return { ok: true, ticket: supportTicketAdminDTO(ticket) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Mise à jour impossible." };
  }
}

/** One attachment payload for an admin-side download link. */
export async function getSupportTicketAttachmentAction(
  ticketId: string,
  index: number,
): Promise<{ fileName: string; mimeType: string; dataBase64: string } | null> {
  await requireAdminCustomer();
  return getSupportTicketAttachment(ticketId, index);
}
