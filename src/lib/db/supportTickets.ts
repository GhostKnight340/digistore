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

/** Optional close outcome the admin picks when closing a ticket. */
export type SupportTicketResolution = "resolved" | "cancelled" | "dismissed";

/** One admin reply sent to the customer. */
export type SupportReply = { body: string; createdAt: string };

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
  resolution: string | null;
  replies: SupportReply[];
  feedbackGiven: boolean;
  feedbackToken: string | null;
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
  resolution: string | null;
  replies: SupportReply[];
  feedbackRating: number | null;
  feedbackComment: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredAttachment = { fileName?: string; mimeType?: string; dataBase64?: string };

function attachmentList(value: unknown): StoredAttachment[] {
  return Array.isArray(value) ? (value as StoredAttachment[]) : [];
}

function replyList(value: unknown): SupportReply[] {
  if (!Array.isArray(value)) return [];
  return (value as Partial<SupportReply>[])
    .filter((r) => r && typeof r.body === "string")
    .map((r) => ({ body: String(r.body), createdAt: String(r.createdAt ?? "") }));
}

/** Full row shape shared by the admin + customer DTO mappers. */
type SupportTicketRow = {
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
  resolution: string | null;
  replies: unknown;
  discordMessageId: string | null;
  discordThreadId: string | null;
  feedbackToken: string | null;
  feedbackRating: number | null;
  feedbackComment: string | null;
  feedbackAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toAdminDTO(t: SupportTicketRow): SupportTicketAdminDTO {
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
    resolution: t.resolution,
    replies: replyList(t.replies),
    feedbackRating: t.feedbackRating,
    feedbackComment: t.feedbackComment,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Owner-facing view (status lookup + account page). Access is always gated by
 *  proof of ownership (reference+email, or a linked customerId), so the
 *  feedback token — which lets the owner rate a closed ticket — is included. */
function toCustomerDTO(t: SupportTicketRow): SupportTicketStatusDTO {
  return {
    reference: t.reference,
    category: t.category,
    subIssueLabel: t.subIssueLabel,
    orderRef: t.orderRef,
    message: t.message,
    status: t.status,
    resolution: t.resolution,
    replies: replyList(t.replies),
    feedbackGiven: t.feedbackAt != null,
    feedbackToken: t.feedbackToken,
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
  return toCustomerDTO(ticket);
}

/**
 * Which tickets belong to a logged-in customer for the account "Support" page.
 * Matches the hard `customerId` link (set when the ticket was opened while
 * signed in) OR — so guest tickets opened before/without signing in still show
 * up — the account's own e-mail, but only when that e-mail is verified (an
 * unverified address is never treated as proof of ownership).
 */
function customerTicketWhere(customerId: string, verifiedEmail?: string | null) {
  const email = verifiedEmail?.trim();
  if (!email) return { customerId };
  return { OR: [{ customerId }, { email: { equals: email, mode: "insensitive" as const } }] };
}

/** All tickets owned by a logged-in customer, newest first. Ownership is the
 *  customerId link or the account's verified e-mail, so replies + feedback
 *  token are safe to surface here. */
export async function listSupportTicketsForCustomer(
  customerId: string,
  verifiedEmail?: string | null,
): Promise<SupportTicketStatusDTO[]> {
  await ensureDatabaseReady();
  if (!customerId) return [];
  const tickets = await prisma.supportTicket.findMany({
    where: customerTicketWhere(customerId, verifiedEmail),
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return tickets.map(toCustomerDTO);
}

export async function countSupportTicketsForCustomer(
  customerId: string,
  verifiedEmail?: string | null,
): Promise<number> {
  if (!customerId) return 0;
  await ensureDatabaseReady();
  return prisma.supportTicket.count({ where: customerTicketWhere(customerId, verifiedEmail) });
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

/** Full row returned by the mutation helpers so the action layer can build the
 *  Discord card + reply/close emails without a second query. */
export type SupportTicketRecord = SupportTicketRow;

/** Public mapper so server actions can hand the client a clean admin DTO. */
export function supportTicketAdminDTO(row: SupportTicketRecord): SupportTicketAdminDTO {
  return toAdminDTO(row);
}

export async function getSupportTicketRecord(id: string): Promise<SupportTicketRecord | null> {
  await ensureDatabaseReady();
  return prisma.supportTicket.findUnique({ where: { id } });
}

export async function updateSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
): Promise<SupportTicketRecord> {
  // Reopening drops any prior close resolution so a re-closed ticket isn't
  // stamped with a stale outcome.
  return prisma.supportTicket.update({
    where: { id },
    data: status === "open" ? { status, resolution: null } : { status },
  });
}

/** Appends an admin reply and flips the ticket to "answered". The reply text is
 *  what the customer sees on the tracking/account pages and in the reply email. */
export async function addSupportTicketReply(
  id: string,
  body: string,
): Promise<SupportTicketRecord> {
  await ensureDatabaseReady();
  const existing = await prisma.supportTicket.findUnique({
    where: { id },
    select: { replies: true },
  });
  if (!existing) throw new Error("Demande introuvable.");
  const replies: SupportReply[] = [
    ...replyList(existing.replies),
    { body, createdAt: new Date().toISOString() },
  ];
  return prisma.supportTicket.update({
    where: { id },
    data: {
      status: "answered",
      replies: replies as unknown as Prisma.InputJsonValue,
    },
  });
}

function randomFeedbackToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Closes a ticket with an optional resolution and guarantees a feedback token
 *  exists (so the close email can link to the feedback page). */
export async function closeSupportTicket(
  id: string,
  resolution: SupportTicketResolution | null,
): Promise<SupportTicketRecord> {
  await ensureDatabaseReady();
  const existing = await prisma.supportTicket.findUnique({
    where: { id },
    select: { feedbackToken: true },
  });
  if (!existing) throw new Error("Demande introuvable.");
  return prisma.supportTicket.update({
    where: { id },
    data: {
      status: "closed",
      resolution,
      feedbackToken: existing.feedbackToken ?? randomFeedbackToken(),
    },
  });
}

/** Persists the Discord card/thread ids after they are created — mirrors the
 *  order-thread persistence step. */
export async function persistSupportDiscordIds(
  id: string,
  discordMessageId: string | null,
  discordThreadId: string | null,
): Promise<void> {
  await prisma.supportTicket.update({
    where: { id },
    data: { discordMessageId, discordThreadId },
  });
}

/** Public feedback lookup — the token is the only credential (it is unguessable
 *  and single-purpose). Returns null once feedback was already submitted. */
export async function getSupportTicketByFeedbackToken(
  token: string,
): Promise<{ reference: string; feedbackGiven: boolean } | null> {
  await ensureDatabaseReady();
  const t = (token ?? "").trim();
  if (!t) return null;
  const ticket = await prisma.supportTicket.findUnique({
    where: { feedbackToken: t },
    select: { reference: true, feedbackAt: true },
  });
  if (!ticket) return null;
  return { reference: ticket.reference, feedbackGiven: ticket.feedbackAt != null };
}

/** Stores a customer's post-close rating (1-5) + optional comment, keyed by the
 *  feedback token. Idempotency: refuses a second submission. */
export async function saveSupportTicketFeedback(
  token: string,
  rating: number,
  comment: string | null,
): Promise<SupportTicketRecord | null> {
  await ensureDatabaseReady();
  const t = (token ?? "").trim();
  if (!t || rating < 1 || rating > 5) return null;
  const ticket = await prisma.supportTicket.findUnique({ where: { feedbackToken: t } });
  if (!ticket || ticket.feedbackAt != null) return null;
  return prisma.supportTicket.update({
    where: { feedbackToken: t },
    data: {
      feedbackRating: Math.round(rating),
      feedbackComment: comment?.trim().slice(0, 2000) || null,
      feedbackAt: new Date(),
    },
  });
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
