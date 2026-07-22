"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listSupportTickets,
  updateSupportTicketStatus,
  closeSupportTicket,
  getSupportTicketAttachment,
  setTicketOwnership,
  supportTicketAdminDTO,
  type SupportTicketAdminDTO,
  type SupportTicketRecord,
  type SupportTicketStatus,
  type SupportTicketResolution,
} from "@/lib/db/supportTickets";
import { notifySupportTicketStatus } from "@/lib/discord/notify";
import {
  deliverSupportReply,
  sendSupportEmail,
  cardInput,
  feedbackUrl,
} from "@/lib/support/deliverReply";

const VALID_STATUSES: SupportTicketStatus[] = ["open", "answered", "closed"];
const VALID_RESOLUTIONS: SupportTicketResolution[] = ["resolved", "cancelled", "dismissed"];
const RESOLUTION_LABEL: Record<SupportTicketResolution, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

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
  const res = await deliverSupportReply(id, body);
  if (res.ok) {
    // A human replied → they own the conversation now.
    await setTicketOwnership(id, "human");
    revalidatePath("/admin");
  }
  return res;
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
