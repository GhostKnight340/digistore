import "server-only";

import { prisma } from "./prisma";
import { writeAuditLog } from "./adminAudit";

/**
 * Private internal admin notes on a customer. Never customer-visible. Append-only
 * with soft-delete: a note is archived (never hard-deleted) so history survives —
 * corrections are new notes. Every add/archive writes an audit event.
 */

export const NOTE_CATEGORIES = ["general", "support", "fraud", "payment"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

function normalizeCategory(value: string): NoteCategory {
  return (NOTE_CATEGORIES as readonly string[]).includes(value)
    ? (value as NoteCategory)
    : "general";
}

export interface CustomerNoteDTO {
  id: string;
  category: NoteCategory;
  body: string;
  authorName: string;
  orderId: string | null;
  archived: boolean;
  createdAt: string;
}

export async function listCustomerNotes(
  customerId: string,
  { includeArchived = true }: { includeArchived?: boolean } = {},
): Promise<CustomerNoteDTO[]> {
  const rows = await prisma.customerNote.findMany({
    where: { customerId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    category: normalizeCategory(row.category),
    body: row.body,
    authorName: row.authorName,
    orderId: row.orderId,
    archived: row.archivedAt != null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function addCustomerNote(input: {
  customerId: string;
  authorId: string;
  authorName: string;
  category: string;
  body: string;
  orderId?: string | null;
}): Promise<{ ok: boolean; error?: string; note?: CustomerNoteDTO }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "La note ne peut pas être vide." };
  const exists = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!exists) return { ok: false, error: "Client introuvable." };

  const category = normalizeCategory(input.category);
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.customerNote.create({
      data: {
        customerId: input.customerId,
        authorId: input.authorId,
        authorName: input.authorName,
        category,
        body: body.slice(0, 4000),
        orderId: input.orderId?.trim() || null,
      },
    });
    await writeAuditLog(
      {
        adminId: input.authorId,
        adminName: input.authorName,
        customerId: input.customerId,
        action: "customer.note_added",
        metadata: { noteId: created.id, category },
      },
      tx,
    );
    return created;
  });

  return {
    ok: true,
    note: {
      id: note.id,
      category,
      body: note.body,
      authorName: note.authorName,
      orderId: note.orderId,
      archived: false,
      createdAt: note.createdAt.toISOString(),
    },
  };
}

/** Soft-delete (archive) a note. Preserves the row; records who/when + audit. */
export async function archiveCustomerNote(input: {
  noteId: string;
  adminId: string;
  adminName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const note = await prisma.customerNote.findUnique({
    where: { id: input.noteId },
    select: { id: true, customerId: true, archivedAt: true },
  });
  if (!note) return { ok: false, error: "Note introuvable." };
  if (note.archivedAt) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.customerNote.update({
      where: { id: input.noteId },
      data: { archivedAt: new Date(), archivedBy: input.adminName },
    });
    await writeAuditLog(
      {
        adminId: input.adminId,
        adminName: input.adminName,
        customerId: note.customerId,
        action: "customer.note_archived",
        metadata: { noteId: input.noteId },
      },
      tx,
    );
  });
  return { ok: true };
}
