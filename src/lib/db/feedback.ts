import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { createSupportTicket } from "./supportTickets";
import {
  formatFeedbackReference,
  parseFeedbackReference,
  validateFeedback,
  deriveFeedbackTitle,
  feedbackTypeLabel,
  isFeedbackStatus,
  isFeedbackPriority,
  FEEDBACK_LIMITS,
  type FeedbackType,
} from "@/lib/feedback";
import type {
  FeedbackListFilters,
  FeedbackListItemDTO,
  FeedbackListResult,
  FeedbackDetailDTO,
} from "@/lib/feedbackDto";

const PAGE_SIZE = 25;
// Spam guards. Kept lenient so legitimate repeat feedback is not blocked.
const MAX_PER_HOUR = 6;
const DUP_WINDOW_MS = 5 * 60 * 1000;

/** Salted one-way hash of an IP — used only for rate-limiting/dup detection. */
export function hashIp(ip: string | null | undefined): string | null {
  const clean = (ip ?? "").trim();
  if (!clean) return null;
  return createHash("sha256")
    .update(`${clean}:${process.env.AUTH_SECRET ?? "ghost-feedback"}`)
    .digest("hex");
}

/** Strip control chars, trim, cap. Feedback is stored + rendered as plain text. */
function plain(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

// ── Pending attachment (uploaded before its submission exists) ───────────────

export async function createPendingAttachment(input: {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  url: string;
}): Promise<string> {
  await ensureDatabaseReady();
  const row = await prisma.feedbackAttachment.create({
    data: {
      mimeType: input.mimeType,
      fileName: plain(input.fileName, 200) || "capture",
      sizeBytes: input.sizeBytes,
      url: input.url,
    },
    select: { id: true },
  });
  return row.id;
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateFeedbackInput {
  type: string;
  /** The single feedback field. A short title is derived from it for the admin list. */
  message: string;
  contactAllowed: boolean;
  guestName?: string;
  guestEmail?: string;
  attachmentId?: string | null;
  deploymentVersion?: string | null;
  context: {
    relatedUrl?: string;
    relatedRoute?: string;
    pageTitle?: string;
    deviceType?: string;
    viewport?: string;
    browserSummary?: string;
  };
  /** Session-derived customer (never client-supplied), or null for a guest. */
  customer: { id: string; name: string; email: string } | null;
  ipHash: string | null;
}

export type CreateFeedbackResult =
  | { ok: true; reference: string; id: string; isNew: boolean }
  | { ok: false; error: string; rateLimited?: boolean };

export async function createFeedback(
  input: CreateFeedbackInput,
): Promise<CreateFeedbackResult> {
  await ensureDatabaseReady();

  const isGuest = !input.customer;
  const effectiveEmail = input.customer?.email ?? (input.guestEmail ?? "").trim();
  const message = plain(input.message, FEEDBACK_LIMITS.messageMax);
  // A short one-line title is derived from the feedback for the admin list —
  // the full typed text is always kept as the message.
  const subject = deriveFeedbackTitle(message);

  const error = validateFeedback({
    type: input.type,
    message,
    contactAllowed: input.contactAllowed,
    effectiveEmail,
  });
  if (error) return { ok: false, error };

  const now = new Date();
  const identityOr: Prisma.FeedbackSubmissionWhereInput[] = [];
  if (input.customer) identityOr.push({ customerId: input.customer.id });
  if (input.ipHash) identityOr.push({ ipHash: input.ipHash });

  // Rate limit: bounded submissions per identity per hour.
  if (identityOr.length > 0) {
    const recentCount = await prisma.feedbackSubmission.count({
      where: {
        OR: identityOr,
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= MAX_PER_HOUR) {
      return {
        ok: false,
        rateLimited: true,
        error: "Vous avez envoyé plusieurs retours récemment. Réessayez dans un moment.",
      };
    }

    // Duplicate-content detection: same identity + same subject/message within a
    // short window returns the existing reference (no new row, no 2nd notify).
    const dup = await prisma.feedbackSubmission.findFirst({
      where: {
        OR: identityOr,
        subject,
        message,
        createdAt: { gte: new Date(now.getTime() - DUP_WINDOW_MS) },
      },
      select: { id: true, seq: true },
    });
    if (dup) {
      return { ok: true, reference: formatFeedbackReference(dup.seq), id: dup.id, isNew: false };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.feedbackSubmission.create({
      data: {
        type: input.type,
        subject,
        message,
        contactAllowed: input.contactAllowed,
        customerId: input.customer?.id ?? null,
        guestName: isGuest ? plain(input.guestName ?? "", FEEDBACK_LIMITS.nameMax) || null : null,
        guestEmail: isGuest ? (effectiveEmail ? effectiveEmail.slice(0, FEEDBACK_LIMITS.emailMax) : null) : null,
        relatedUrl: input.context.relatedUrl?.slice(0, 500) || null,
        relatedRoute: input.context.relatedRoute?.slice(0, 300) || null,
        pageTitle: input.context.pageTitle?.slice(0, 200) || null,
        deviceType: input.context.deviceType?.slice(0, 20) || null,
        viewport: input.context.viewport?.slice(0, 20) || null,
        browserSummary: input.context.browserSummary?.slice(0, 120) || null,
        deploymentVersion: input.deploymentVersion?.slice(0, 60) || null,
        ipHash: input.ipHash,
      },
      select: { id: true, seq: true },
    });

    // Link a previously-uploaded, still-unlinked attachment.
    if (input.attachmentId) {
      await tx.feedbackAttachment.updateMany({
        where: { id: input.attachmentId, submissionId: null },
        data: { submissionId: row.id },
      });
    }

    await tx.feedbackActivity.create({
      data: {
        submissionId: row.id,
        actorName: input.customer?.name ?? "Visiteur",
        action: "created",
        metadata: { type: input.type } as Prisma.InputJsonValue,
      },
    });
    return row;
  });

  return { ok: true, reference: formatFeedbackReference(created.seq), id: created.id, isNew: true };
}

// ── Admin: list ──────────────────────────────────────────────────────────────

function senderLabel(row: {
  customer: { name: string; email: string } | null;
  guestName: string | null;
  guestEmail: string | null;
}): string {
  if (row.customer) return row.customer.name || row.customer.email;
  return row.guestName || row.guestEmail || "Visiteur";
}

export async function listFeedback(
  filters: FeedbackListFilters,
): Promise<FeedbackListResult> {
  await ensureDatabaseReady();
  const page = Math.max(1, filters.page ?? 1);
  const sort = filters.sort ?? "newest";
  const and: Prisma.FeedbackSubmissionWhereInput[] = [];

  const q = (filters.query ?? "").trim();
  if (q) {
    const seq = parseFeedbackReference(q);
    const or: Prisma.FeedbackSubmissionWhereInput[] = [
      { subject: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
      { guestName: { contains: q, mode: "insensitive" } },
      { guestEmail: { contains: q, mode: "insensitive" } },
      { relatedRoute: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
    ];
    if (seq != null) or.push({ seq });
    and.push({ OR: or });
  }
  if (filters.type) and.push({ type: filters.type });
  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.audience === "customer") and.push({ customerId: { not: null } });
  if (filters.audience === "guest") and.push({ customerId: null });
  if (filters.attachment === "has") and.push({ attachments: { some: {} } });
  if (filters.assignment === "assigned") and.push({ assignedAdminId: { not: null } });
  if (filters.assignment === "unassigned") and.push({ assignedAdminId: null });
  if (filters.from) and.push({ createdAt: { gte: new Date(filters.from) } });
  if (filters.to) and.push({ createdAt: { lte: new Date(`${filters.to}T23:59:59`) } });

  const where: Prisma.FeedbackSubmissionWhereInput = and.length ? { AND: and } : {};

  const orderBy: Prisma.FeedbackSubmissionOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ createdAt: "asc" }]
      : sort === "updated"
        ? [{ updatedAt: "desc" }]
        : sort === "priority"
          ? [{ priority: "asc" }, { createdAt: "desc" }] // critical<high<low alpha—remap below
          : [{ createdAt: "desc" }];

  const [total, rows] = await Promise.all([
    prisma.feedbackSubmission.count({ where }),
    prisma.feedbackSubmission.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        seq: true,
        type: true,
        subject: true,
        status: true,
        priority: true,
        customerId: true,
        guestName: true,
        guestEmail: true,
        relatedRoute: true,
        assignedAdminName: true,
        createdAt: true,
        customer: { select: { name: true, email: true } },
        _count: { select: { attachments: true } },
      },
    }),
  ]);

  // Priority sort needs the real order (critical→low); re-sort in memory for the
  // page when requested (bounded to PAGE_SIZE rows).
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const ordered =
    sort === "priority"
      ? rows.sort(
          (a, b) =>
            (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
      : rows;

  const items: FeedbackListItemDTO[] = ordered.map((r) => ({
    id: r.id,
    reference: formatFeedbackReference(r.seq),
    type: r.type,
    subject: r.subject,
    senderLabel: senderLabel(r),
    isGuest: !r.customerId,
    relatedRoute: r.relatedRoute,
    createdAt: r.createdAt.toISOString(),
    status: (isFeedbackStatus(r.status) ? r.status : "new") as FeedbackListItemDTO["status"],
    priority: (isFeedbackPriority(r.priority) ? r.priority : "medium") as FeedbackListItemDTO["priority"],
    hasAttachment: r._count.attachments > 0,
    assignedAdminName: r.assignedAdminName,
  }));

  return { items, total, page, pageSize: PAGE_SIZE };
}

// ── Admin: detail ────────────────────────────────────────────────────────────

export async function getFeedbackDetail(id: string): Promise<FeedbackDetailDTO | null> {
  await ensureDatabaseReady();
  const row = await prisma.feedbackSubmission.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      attachments: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    reference: formatFeedbackReference(row.seq),
    type: row.type,
    subject: row.subject,
    message: row.message,
    status: (isFeedbackStatus(row.status) ? row.status : "new") as FeedbackDetailDTO["status"],
    priority: (isFeedbackPriority(row.priority) ? row.priority : "medium") as FeedbackDetailDTO["priority"],
    isGuest: !row.customerId,
    customerId: row.customerId,
    senderName: row.customer?.name ?? row.guestName ?? "Visiteur",
    senderEmail: row.customer?.email ?? row.guestEmail ?? "",
    contactAllowed: row.contactAllowed,
    relatedUrl: row.relatedUrl,
    relatedRoute: row.relatedRoute,
    pageTitle: row.pageTitle,
    deviceType: row.deviceType,
    viewport: row.viewport,
    browserSummary: row.browserSummary,
    deploymentVersion: row.deploymentVersion,
    assignedAdminId: row.assignedAdminId,
    assignedAdminName: row.assignedAdminName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: a.url,
    })),
    notes: row.notes.map((n) => ({
      id: n.id,
      authorName: n.authorName,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    activity: row.activity.map((e) => ({
      id: e.id,
      actorName: e.actorName,
      action: e.action,
      metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// ── Admin: mutations ─────────────────────────────────────────────────────────

type Actor = { id: string; name: string };
type Result = { ok: boolean; error?: string };

async function logActivity(
  db: Prisma.TransactionClient,
  submissionId: string,
  actorName: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  await db.feedbackActivity.create({
    data: {
      submissionId,
      actorName,
      action,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function setFeedbackStatus(
  id: string,
  status: string,
  actor: Actor,
): Promise<Result> {
  await ensureDatabaseReady();
  if (!isFeedbackStatus(status)) return { ok: false, error: "Statut invalide." };
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return { ok: false, error: "Retour introuvable." };
  await prisma.$transaction(async (tx) => {
    await tx.feedbackSubmission.update({
      where: { id },
      data: { status, closedAt: status === "closed" ? new Date() : null },
    });
    await logActivity(tx, id, actor.name, "status_changed", { from: existing.status, to: status });
  });
  return { ok: true };
}

export async function setFeedbackPriority(
  id: string,
  priority: string,
  actor: Actor,
): Promise<Result> {
  await ensureDatabaseReady();
  if (!isFeedbackPriority(priority)) return { ok: false, error: "Priorité invalide." };
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { priority: true },
  });
  if (!existing) return { ok: false, error: "Retour introuvable." };
  await prisma.$transaction(async (tx) => {
    await tx.feedbackSubmission.update({ where: { id }, data: { priority } });
    await logActivity(tx, id, actor.name, "priority_changed", {
      from: existing.priority,
      to: priority,
    });
  });
  return { ok: true };
}

export async function assignFeedback(
  id: string,
  assignee: Actor | null,
  actor: Actor,
): Promise<Result> {
  await ensureDatabaseReady();
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Retour introuvable." };
  await prisma.$transaction(async (tx) => {
    await tx.feedbackSubmission.update({
      where: { id },
      data: {
        assignedAdminId: assignee?.id ?? null,
        assignedAdminName: assignee?.name ?? null,
      },
    });
    await logActivity(tx, id, actor.name, "assigned", { to: assignee?.name ?? null });
  });
  return { ok: true };
}

export async function addFeedbackNote(
  id: string,
  actor: Actor,
  body: string,
): Promise<Result> {
  await ensureDatabaseReady();
  const clean = plain(body, 4000);
  if (!clean) return { ok: false, error: "La note est vide." };
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Retour introuvable." };
  await prisma.$transaction(async (tx) => {
    await tx.feedbackNote.create({
      data: { submissionId: id, authorId: actor.id, authorName: actor.name, body: clean },
    });
    await logActivity(tx, id, actor.name, "note_added");
  });
  return { ok: true };
}

export async function linkFeedbackEntity(
  id: string,
  entityType: string,
  entityRef: string,
  actor: Actor,
): Promise<Result> {
  await ensureDatabaseReady();
  const existing = await prisma.feedbackSubmission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Retour introuvable." };
  await prisma.$transaction(async (tx) => {
    await logActivity(tx, id, actor.name, "linked", {
      entityType: plain(entityType, 40),
      entityRef: plain(entityRef, 120),
    });
  });
  return { ok: true };
}

export async function convertFeedbackToSupport(
  id: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string; reference?: string }> {
  await ensureDatabaseReady();
  const row = await prisma.feedbackSubmission.findUnique({
    where: { id },
    include: { customer: { select: { id: true, name: true, email: true } } },
  });
  if (!row) return { ok: false, error: "Retour introuvable." };
  const email = row.customer?.email ?? row.guestEmail ?? "";
  if (!email) {
    return { ok: false, error: "Aucune adresse e-mail : impossible de créer une demande de support." };
  }
  const ticket = await createSupportTicket({
    category: "autre",
    subIssue: "x3",
    subIssueLabel: "Autre demande",
    name: row.customer?.name ?? row.guestName ?? "Client",
    email,
    message: `[Depuis un retour ${formatFeedbackReference(row.seq)} · ${feedbackTypeLabel(
      row.type,
    )}]\n\n${row.subject}\n\n${row.message}`,
    customerId: row.customerId,
  });
  await prisma.$transaction(async (tx) => {
    await tx.feedbackSubmission.update({
      where: { id },
      data: { status: "closed", closedAt: new Date() },
    });
    await logActivity(tx, id, actor.name, "converted_to_support", {
      supportReference: ticket.reference,
    });
  });
  return { ok: true, reference: ticket.reference };
}

/** Compact submissions for a specific customer (account "my feedback" list). */
export async function listCustomerFeedback(customerId: string) {
  await ensureDatabaseReady();
  const rows = await prisma.feedbackSubmission.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { seq: true, type: true, subject: true, status: true, createdAt: true },
  });
  return rows.map((r) => ({
    reference: formatFeedbackReference(r.seq),
    type: r.type,
    subject: r.subject,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type { FeedbackType };
