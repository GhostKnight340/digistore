import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "./prisma";

export type SupportAttachment = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type CreateSupportTicketInput = {
  category: string;
  subIssue: string;
  subIssueLabel: string;
  orderRef?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  attachments?: SupportAttachment[];
  customerId?: string | null;
};

export type SupportTicketStatus = "open" | "answered" | "closed";

/** Safe customer-facing view — looked up by reference + email pair (a bare
 *  reference is enumerable, so it is never enough on its own). No attachment
 *  payloads, no internal ids. */
export type SupportTicketStatusDTO = {
  reference: string;
  category: string;
  subIssueLabel: string;
  orderRef: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** Admin list/detail views. Attachment data stays out of the list payload —
 *  it is fetched per-file on demand. */
export type SupportTicketAdminDTO = {
  id: string;
  reference: string;
  category: string;
  subIssue: string;
  subIssueLabel: string;
  orderRef: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  attachmentNames: string[];
  customerId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type StoredAttachment = { fileName?: string; mimeType?: string; dataBase64?: string };

function attachmentList(value: unknown): StoredAttachment[] {
  return Array.isArray(value) ? (value as StoredAttachment[]) : [];
}

function toAdminDTO(t: {
  id: string;
  reference: string;
  category: string;
  subIssue: string;
  subIssueLabel: string;
  orderRef: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  attachments: unknown;
  customerId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): SupportTicketAdminDTO {
  return {
    id: t.id,
    reference: t.reference,
    category: t.category,
    subIssue: t.subIssue,
    subIssueLabel: t.subIssueLabel,
    orderRef: t.orderRef,
    name: t.name,
    email: t.email,
    phone: t.phone,
    message: t.message,
    attachmentNames: attachmentList(t.attachments).map((a, i) => a.fileName || `fichier-${i + 1}`),
    customerId: t.customerId,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Customer status lookup: the reference AND the submitting email must match
 *  (case-insensitive) — mirrors the delivery-page rule that public numbers are
 *  never treated as authentication on their own. */
export async function findSupportTicketForCustomer(
  reference: string,
  email: string,
): Promise<SupportTicketStatusDTO | null> {
  await ensureDatabaseReady();
  const ref = reference.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!ref || !normalizedEmail) return null;
  const ticket = await prisma.supportTicket.findUnique({ where: { reference: ref } });
  if (!ticket || ticket.email.trim().toLowerCase() !== normalizedEmail) return null;
  return {
    reference: ticket.reference,
    category: ticket.category,
    subIssueLabel: ticket.subIssueLabel,
    orderRef: ticket.orderRef,
    message: ticket.message,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function listSupportTickets(
  filter: { status?: string } = {},
): Promise<SupportTicketAdminDTO[]> {
  await ensureDatabaseReady();
  const tickets = await prisma.supportTicket.findMany({
    where: filter.status ? { status: filter.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return tickets.map(toAdminDTO);
}

export async function countOpenSupportTickets(): Promise<number> {
  return prisma.supportTicket.count({ where: { status: "open" } });
}

export async function updateSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
): Promise<SupportTicketAdminDTO> {
  const updated = await prisma.supportTicket.update({ where: { id }, data: { status } });
  return toAdminDTO(updated);
}

/** One attachment's payload for an admin download. */
export async function getSupportTicketAttachment(
  ticketId: string,
  index: number,
): Promise<{ fileName: string; mimeType: string; dataBase64: string } | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { attachments: true },
  });
  const file = attachmentList(ticket?.attachments)[index];
  if (!file?.dataBase64) return null;
  return {
    fileName: file.fileName || `fichier-${index + 1}`,
    mimeType: file.mimeType || "application/octet-stream",
    dataBase64: file.dataBase64,
  };
}

function randomReference(): string {
  // GH-S-XXXXXX — same shape the design handoff shows to the customer.
  return `GH-S-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** Create a ticket with a collision-safe public reference (unique column +
 *  retry). The reference is the id customers quote to support. */
export async function createSupportTicket(
  input: CreateSupportTicketInput,
): Promise<{ id: string; reference: string }> {
  await ensureDatabaseReady();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = randomReference();
    try {
      const ticket = await prisma.supportTicket.create({
        data: {
          reference,
          category: input.category,
          subIssue: input.subIssue,
          subIssueLabel: input.subIssueLabel,
          orderRef: input.orderRef ?? null,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          message: input.message ?? null,
          attachments: input.attachments?.length
            ? (input.attachments as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          customerId: input.customerId ?? null,
        },
        select: { id: true, reference: true },
      });
      return ticket;
    } catch (error) {
      // P2002 = reference collision — regenerate and retry.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Impossible de générer une référence de demande.");
}
