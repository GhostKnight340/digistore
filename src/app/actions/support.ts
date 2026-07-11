"use server";

import { getCurrentCustomer } from "@/lib/auth";
import { createSupportTicket, type SupportAttachment } from "@/lib/db/supportTickets";
import { notifySupportTicket } from "@/lib/discord/notify";
import { findSupportCategory, findSupportSubIssue } from "@/lib/support/config";

const EMAIL_RE = /.+@.+\..+/;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // per file, pre-encoding
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;

export type SubmitSupportInput = {
  category: string;
  subIssue: string;
  orderRef?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  attachments?: { fileName: string; mimeType: string; dataBase64: string }[];
};

export type SubmitSupportResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

/**
 * Public (guest-friendly) support-ticket submission for the guided /support
 * flow. Validates against the shared category/sub-issue registry, freezes the
 * French label onto the ticket, stores capped attachments, links the logged-in
 * customer when present, and posts a Discord card to #support (never blocks
 * the submission if Discord fails).
 */
export async function submitSupportTicketAction(
  input: SubmitSupportInput,
): Promise<SubmitSupportResult> {
  const category = findSupportCategory(input.category);
  const sub = category ? findSupportSubIssue(category.key, input.subIssue) : undefined;
  if (!category || !sub) return { ok: false, error: "Sujet invalide — recommencez la sélection." };

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  if (!name) return { ok: false, error: "Le nom est requis." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Adresse e-mail invalide." };

  const orderRef = (input.orderRef ?? "").trim().slice(0, 40) || null;
  const phone = (input.phone ?? "").trim().slice(0, 30) || null;
  const message = (input.message ?? "").trim().slice(0, 4000) || null;

  const attachments: SupportAttachment[] = [];
  for (const file of (input.attachments ?? []).slice(0, MAX_ATTACHMENTS)) {
    if (!file?.dataBase64 || !ALLOWED_MIME.test(file.mimeType ?? "")) continue;
    // base64 inflates by ~4/3 — compare decoded size against the cap.
    const approxBytes = Math.floor(file.dataBase64.length * 0.75);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `Le fichier « ${file.fileName} » dépasse 2 Mo.` };
    }
    attachments.push({
      fileName: (file.fileName || "fichier").slice(0, 120),
      mimeType: file.mimeType,
      dataBase64: file.dataBase64,
    });
  }

  const customer = await getCurrentCustomer().catch(() => null);

  let ticket: { reference: string };
  try {
    ticket = await createSupportTicket({
      category: category.key,
      subIssue: sub.id,
      subIssueLabel: sub.label,
      orderRef,
      name,
      email,
      phone,
      message,
      attachments,
      customerId: customer?.id ?? null,
    });
  } catch (error) {
    console.error("[support:submit]", error instanceof Error ? error.message : error);
    return { ok: false, error: "Une erreur est survenue. Réessayez dans un instant." };
  }

  // Fire-and-forget by contract: safeSend never throws and must never block
  // or fail the customer's submission.
  await notifySupportTicket({
    reference: ticket.reference,
    categoryLabel: category.label,
    subIssueLabel: sub.label,
    orderRef,
    name,
    email,
    phone,
    message,
    attachmentCount: attachments.length,
  });

  return { ok: true, reference: ticket.reference };
}
