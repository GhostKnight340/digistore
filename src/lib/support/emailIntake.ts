/**
 * Support email intake — durable delayed job (server-only).
 *
 * `receiveInboundEmail` stores a received email ONCE (idempotent by Message-ID /
 * provider event id) with a future `dueAt`, and returns immediately — the
 * webhook never blocks. `processDueEmailIntakes` (a cron) later matches each due
 * email to an existing ticket (thread refs → order ref → open ticket for the
 * sender), appends it as a customer message, or creates a new ticket. The delay
 * lets any other ticket-creating workflow win first, avoiding duplicates. Every
 * step is idempotent; a claimed row can't be double-processed.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { log } from "@/lib/ops/log";
import { getAiOpsSettings } from "@/lib/ai-ops/store";
import {
  findTicketByEmailIds,
  findTicketByOrderRef,
  findOpenTicketByEmail,
  appendEmailCustomerMessage,
  appendTicketAttachments,
  createSupportTicketFromEmail,
  type SupportAttachment,
} from "@/lib/db/supportTickets";
import { parseReferenceIds, stripQuotedReply, extractOrderRef } from "@/lib/ai-ops/support/thread";
import type { NormalizedInboundEmail } from "./inboundEmail";

export interface ReceiveResult {
  ok: boolean;
  deduped: boolean;
  intakeId?: string;
  /** True when the original sender couldn't be resolved → held for manual review. */
  needsReview?: boolean;
}

async function resolveCustomerId(email: string): Promise<string | null> {
  const row = await prisma.customer.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  return row?.id ?? null;
}

/** Store a received email as a pending intake (idempotent). Never throws for a duplicate. */
export async function receiveInboundEmail(
  email: NormalizedInboundEmail,
  providerEventId: string | null,
  now: Date = new Date(),
): Promise<ReceiveResult> {
  const settings = await getAiOpsSettings();
  const dueAt = new Date(now.getTime() + Math.max(0, settings.supportEmailFallbackDelaySec) * 1000);
  // Resolve the REAL customer sender (forwarded mail may have a Ghost.ma From).
  // Unresolved → hold for manual review; never create a ticket on a guessed sender.
  const resolved = email.originalSender;
  const customerId = resolved ? await resolveCustomerId(resolved) : null;
  const orderRefGuess = extractOrderRef(`${email.subject ?? ""}\n${email.text ?? ""}`);
  const status = resolved ? "pending" : "manual_review";

  let intakeId: string;
  try {
    const row = await prisma.supportEmailIntake.create({
      data: {
        providerEventId: providerEventId ?? undefined,
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        originalSender: resolved,
        senderSource: email.senderSource,
        senderConfidence: email.senderConfidence,
        rawHeaders: email.rawHeaders.length ? (email.rawHeaders as unknown as object) : undefined,
        toEmail: email.toEmail,
        subject: email.subject,
        bodyText: email.text,
        bodyHtml: email.html,
        attachments: email.attachments.length ? (email.attachments as unknown as object) : undefined,
        orderRefGuess,
        customerId,
        status,
        resultReason: resolved ? null : `sender_unresolved(${email.senderSource})`,
        dueAt,
      },
      select: { id: true },
    });
    intakeId = row.id;
  } catch (error) {
    // P2002 = duplicate messageId or providerEventId → already received (idempotent).
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2002") {
      return { ok: true, deduped: true };
    }
    throw error;
  }

  // Only auto-process a resolved sender. An unresolved one waits as "manual_review".
  if (resolved) await claimAndProcess(intakeId).catch(() => {});
  return { ok: true, deduped: false, intakeId, needsReview: !resolved };
}

type IntakeRow = {
  id: string;
  messageId: string;
  inReplyTo: string | null;
  references: string | null;
  fromEmail: string;
  fromName: string | null;
  originalSender: string | null;
  subject: string | null;
  bodyText: string | null;
  orderRefGuess: string | null;
  customerId: string | null;
  attachments: unknown;
};

function attachmentsOf(value: unknown): SupportAttachment[] {
  return Array.isArray(value) ? (value as SupportAttachment[]) : [];
}

/** Process one claimed intake: match+attach, or create. Returns the result status. */
async function processOne(row: IntakeRow): Promise<{ status: string; ticketId: string | null; reason: string }> {
  // Safety: never create/attach on an unresolved sender (should be manual_review already).
  const customerEmail = row.originalSender;
  if (!customerEmail) return { status: "manual_review", ticketId: null, reason: "sender_unresolved" };

  const refIds = [...parseReferenceIds(row.references), ...parseReferenceIds(row.inReplyTo)];
  const files = attachmentsOf(row.attachments);
  const cleanBody = stripQuotedReply(row.bodyText ?? "") || (row.subject ?? "(message vide)");

  // Match precedence: email thread → order ref → open ticket for the REAL sender.
  const matched =
    (await findTicketByEmailIds(refIds)) ??
    (row.orderRefGuess ? await findTicketByOrderRef(row.orderRefGuess) : null) ??
    (await findOpenTicketByEmail(customerEmail));

  if (matched && matched.status !== "closed") {
    await appendEmailCustomerMessage(matched.id, cleanBody, row.customerId);
    if (files.length) await appendTicketAttachments(matched.id, files);
    return { status: "attached", ticketId: matched.id, reason: "matched_open_ticket" };
  }

  const created = await createSupportTicketFromEmail({
    fromEmail: customerEmail,
    fromName: row.fromName,
    subject: row.subject,
    body: cleanBody,
    attachments: files,
    customerId: row.customerId,
    orderRef: row.orderRefGuess,
    emailMessageId: row.messageId,
    emailReferences: row.references,
    source: "email_fallback",
  });
  return { status: "created", ticketId: created.id, reason: "no_match_created" };
}

/**
 * Claim one intake atomically and process it. Returns "attached" | "created" |
 * "skipped" (someone else claimed it) | "failed". On failure the row is set back
 * to "pending" so the cron backstop retries it. Shared by the inline (immediate)
 * path and the cron.
 */
async function claimAndProcess(id: string): Promise<"attached" | "created" | "skipped" | "failed"> {
  const claim = await prisma.supportEmailIntake.updateMany({
    where: { id, status: "pending" },
    data: { status: "processing", attempts: { increment: 1 } },
  });
  if (claim.count !== 1) return "skipped";

  const row = await prisma.supportEmailIntake.findUnique({ where: { id } });
  if (!row) return "skipped";

  try {
    const outcome = await processOne(row);
    await prisma.supportEmailIntake.update({
      where: { id },
      data: { status: outcome.status, ticketId: outcome.ticketId, resultReason: outcome.reason },
    });
    return outcome.status === "attached" ? "attached" : "created";
  } catch (error) {
    // Release back to pending so the cron retries after dueAt (not terminal).
    await prisma.supportEmailIntake
      .update({ where: { id }, data: { status: "pending", resultReason: (error instanceof Error ? error.message : "error").slice(0, 200) } })
      .catch(() => {});
    log.error("support email intake failed", {
      operation: "support.emailIntake.process",
      result: "error",
      code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return "failed";
  }
}

export interface IntakeSweepResult {
  due: number;
  attached: number;
  created: number;
  failed: number;
}

/** Cron BACKSTOP: reprocess intakes that failed their immediate inline attempt
 *  (still pending and past their retry `dueAt`). Idempotent + claimed. */
export async function processDueEmailIntakes(now: Date = new Date()): Promise<IntakeSweepResult> {
  const result: IntakeSweepResult = { due: 0, attached: 0, created: 0, failed: 0 };
  const pending = await prisma.supportEmailIntake.findMany({
    where: { status: "pending", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: 25,
  });
  result.due = pending.length;

  for (const row of pending) {
    const outcome = await claimAndProcess(row.id);
    if (outcome === "attached") result.attached += 1;
    else if (outcome === "created") result.created += 1;
    else if (outcome === "failed") result.failed += 1;
  }
  return result;
}
