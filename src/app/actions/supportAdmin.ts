"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import {
  listSupportTickets,
  updateSupportTicketStatus,
  getSupportTicketAttachment,
  type SupportTicketAdminDTO,
  type SupportTicketStatus,
} from "@/lib/db/supportTickets";

const VALID_STATUSES: SupportTicketStatus[] = ["open", "answered", "closed"];

export async function listSupportTicketsAction(
  filter: { status?: string } = {},
): Promise<SupportTicketAdminDTO[]> {
  await requireAdminCustomer();
  return listSupportTickets(filter);
}

export async function updateSupportTicketStatusAction(
  id: string,
  status: string,
): Promise<{ ok: boolean; error?: string; ticket?: SupportTicketAdminDTO }> {
  await requireAdminCustomer();
  if (!VALID_STATUSES.includes(status as SupportTicketStatus)) {
    return { ok: false, error: "Statut invalide." };
  }
  try {
    const ticket = await updateSupportTicketStatus(id, status as SupportTicketStatus);
    revalidatePath("/admin");
    return { ok: true, ticket };
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
