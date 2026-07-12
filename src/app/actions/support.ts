"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomer, isProfileIncomplete } from "@/lib/auth";
import {
  createSupportTicket,
  findSupportTicketForCustomer,
  getSupportTicketByFeedbackToken,
  saveSupportTicketFeedback,
  getCustomerTicketRecordByReference,
  addCustomerSupportMessage,
  supportTicketCustomerDTO,
  type SupportAttachment,
  type SupportTicketStatusDTO,
} from "@/lib/db/supportTickets";
import {
  notifySupportTicketCreated,
  notifySupportTicketFeedback,
  notifySupportTicketCustomerReply,
} from "@/lib/discord/notify";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
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

  let ticket: { id: string; reference: string };
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

  // Create the #support card + thread. Fire-and-forget by contract: the Discord
  // layer never throws and must never block or fail the customer's submission.
  await notifySupportTicketCreated({
    ticketId: ticket.id,
    reference: ticket.reference,
    categoryLabel: category.label,
    subIssueLabel: sub.label,
    orderRef,
    name,
    email,
    phone,
    message,
    attachmentCount: attachments.length,
    status: "open",
    resolution: null,
    adminUrl: absoluteAppUrl("/admin"),
    discordMessageId: null,
    discordThreadId: null,
  });

  // Confirmation email — never let a delivery failure fail the submission.
  try {
    await sendTransactionalEmail({
      to: email,
      customerId: customer?.id ?? null,
      templateKey: "support_received",
      type: "support_received",
      variables: {
        customer_name: name,
        reference: ticket.reference,
        subject: `${category.label} — ${sub.label}`,
        support_url: absoluteAppUrl("/support/suivi"),
      },
    });
  } catch (error) {
    console.error("[support:email:received]", error instanceof Error ? error.message : error);
  }

  return { ok: true, reference: ticket.reference };
}

export type SupportFeedbackStatus = { reference: string; feedbackGiven: boolean };

/** Public feedback-page loader — resolves a feedback token to the ticket
 *  reference so the page can confirm which demand is being rated. */
export async function getSupportFeedbackStatusAction(
  token: string,
): Promise<SupportFeedbackStatus | null> {
  try {
    return await getSupportTicketByFeedbackToken(token);
  } catch (error) {
    console.error("[support:feedback:status]", error instanceof Error ? error.message : error);
    return null;
  }
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; error: string };

/**
 * Public post-close feedback submission. The unguessable token is the only
 * credential; a rating of 1-5 is required, an optional comment is capped. One
 * submission per ticket — a second attempt is refused.
 */
export async function submitSupportFeedbackAction(
  token: string,
  rating: number,
  comment?: string | null,
): Promise<SubmitFeedbackResult> {
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Choisissez une note entre 1 et 5 étoiles." };
  }
  let ticket;
  try {
    ticket = await saveSupportTicketFeedback(token, rating, comment ?? null);
  } catch (error) {
    console.error("[support:feedback:submit]", error instanceof Error ? error.message : error);
    return { ok: false, error: "Une erreur est survenue. Réessayez dans un instant." };
  }
  if (!ticket) {
    return { ok: false, error: "Ce lien n'est plus valide ou un avis a déjà été envoyé." };
  }

  void notifySupportTicketFeedback({
    ticketId: ticket.id,
    reference: ticket.reference,
    categoryLabel: findSupportCategory(ticket.category)?.label ?? ticket.category,
    subIssueLabel: ticket.subIssueLabel,
    orderRef: ticket.orderRef,
    name: ticket.name,
    email: ticket.email,
    status: ticket.status,
    resolution: ticket.resolution,
    adminUrl: absoluteAppUrl("/admin"),
    discordMessageId: ticket.discordMessageId,
    discordThreadId: ticket.discordThreadId,
    rating: ticket.feedbackRating ?? rating,
    comment: ticket.feedbackComment,
  });

  return { ok: true };
}

/**
 * Public ticket-status lookup. Requires the reference AND the submitting
 * e-mail: a GH-S-XXXXXX reference is enumerable and is never treated as
 * authentication on its own (same rule as delivery pages). Returns null for
 * any non-match — no distinction between "unknown reference" and "wrong
 * e-mail" to avoid confirming which references exist.
 */
export async function lookupSupportTicketAction(
  reference: string,
  email: string,
): Promise<SupportTicketStatusDTO | null> {
  if (!EMAIL_RE.test((email ?? "").trim())) return null;
  try {
    return await findSupportTicketForCustomer(reference ?? "", email);
  } catch (error) {
    console.error("[support:lookup]", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetches a single owned ticket's current state for the logged-in customer,
 * used to live-refresh an open conversation (polling / on focus) so replies from
 * the support team appear without a manual page reload.
 */
export async function getMySupportTicketAction(
  reference: string,
): Promise<SupportTicketStatusDTO | null> {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return null;
  const accountEmail = isProfileIncomplete(customer) ? null : customer.email;
  try {
    const record = await getCustomerTicketRecordByReference(reference, customer.id, accountEmail);
    return record ? supportTicketCustomerDTO(record) : null;
  } catch (error) {
    console.error("[support:my-ticket]", error instanceof Error ? error.message : error);
    return null;
  }
}

export type CustomerReplyResult =
  | { ok: true; ticket: SupportTicketStatusDTO }
  | { ok: false; error: string };

/**
 * A logged-in customer replies to their own ticket, turning it into a two-way
 * conversation. Ownership is enforced (the ticket must be linked to the account
 * or share its e-mail). The reply resurfaces the ticket for the support team
 * and is posted into the ticket's Discord thread. Closed tickets are read-only.
 */
export async function replyToSupportTicketAction(
  reference: string,
  body: string,
): Promise<CustomerReplyResult> {
  const customer = await getCurrentCustomer().catch(() => null);
  if (!customer) return { ok: false, error: "Connectez-vous pour répondre à votre demande." };

  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Le message ne peut pas être vide." };

  const accountEmail = isProfileIncomplete(customer) ? null : customer.email;

  let updated;
  try {
    const ticket = await getCustomerTicketRecordByReference(reference, customer.id, accountEmail);
    if (!ticket) return { ok: false, error: "Demande introuvable." };
    if (ticket.status === "closed") {
      return { ok: false, error: "Cette demande est clôturée. Ouvrez une nouvelle demande si besoin." };
    }
    updated = await addCustomerSupportMessage(ticket.id, customer.id, text.slice(0, 4000));
  } catch (error) {
    console.error("[support:customer-reply]", error instanceof Error ? error.message : error);
    return { ok: false, error: "Une erreur est survenue. Réessayez dans un instant." };
  }

  void notifySupportTicketCustomerReply({
    ticketId: updated.id,
    reference: updated.reference,
    categoryLabel: findSupportCategory(updated.category)?.label ?? updated.category,
    subIssueLabel: updated.subIssueLabel,
    orderRef: updated.orderRef,
    name: updated.name,
    email: updated.email,
    status: updated.status,
    resolution: updated.resolution,
    adminUrl: absoluteAppUrl("/admin"),
    discordMessageId: updated.discordMessageId,
    discordThreadId: updated.discordThreadId,
    replyBody: text.slice(0, 4000),
  });

  revalidatePath("/account/support");
  revalidatePath("/support/suivi");
  return { ok: true, ticket: supportTicketCustomerDTO(updated) };
}
