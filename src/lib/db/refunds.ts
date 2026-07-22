import "server-only";

import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "./prisma";
import { grantCreditTx } from "./ghostCredit";
import { publicOrderReference } from "./orders";
import {
  canTransition,
  formatRefundNumber,
  isRefundActive,
  isRefundTerminal,
  settledStatusForResolution,
  statusesForQueueTab,
  type RefundQueueTab,
} from "@/lib/refunds/status";
import type {
  RefundActorType,
  RefundMessageChannel,
  RefundReason,
  RefundResolutionType,
  RefundSource,
  RefundStatus,
  RefundTokenPurpose,
} from "@/lib/types";

/**
 * Refund workflow — persistence layer.
 *
 * Every status change goes through `transitionRefund`, which validates the move
 * against the legal state machine (src/lib/refunds/status.ts) BEFORE writing, so
 * the server — not a hidden UI button — is the authority. Money moves reuse the
 * existing Ghost Credit ledger (idempotency-keyed) and Prisma transactions, so a
 * double-submitted admin action can never double-credit or double-process.
 */

type Tx = Prisma.TransactionClient;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ── Actor ────────────────────────────────────────────────────────────────────
export type RefundActor = { type: RefundActorType; id?: string | null; name?: string | null };

// ── Event / note / message recording ─────────────────────────────────────────
export async function recordRefundEvent(
  db: Tx | typeof prisma,
  input: {
    requestId: string;
    type: string;
    actor: RefundActor;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.refundEvent.create({
    data: {
      refundRequestId: input.requestId,
      type: input.type,
      actorType: input.actor.type,
      actorName: input.actor.name ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

// ── Numbering ────────────────────────────────────────────────────────────────
export { formatRefundNumber };

// ── Create ───────────────────────────────────────────────────────────────────
export type CreateRefundInput = {
  /** Internal order id (already authorized upstream). */
  orderId: string;
  source: RefundSource;
  reason: RefundReason;
  description: string;
  /** Defaults to the order total. */
  requestedAmountMad?: number;
  /** Optional phone the customer typed on the form (else the account phone). */
  phone?: string | null;
  attachments?: {
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
  actor: RefundActor;
};

export type CreateRefundResult =
  | { ok: true; id: string; seq: number; number: string; orderPublicNumber: string }
  | { ok: false; error: "order_not_found" | "duplicate_active"; existingId?: string };

export async function createRefundRequest(input: CreateRefundInput): Promise<CreateRefundResult> {
  await ensureDatabaseReady();

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      createdAt: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      totalMad: true,
      customer: { select: { phone: true } },
    },
  });
  if (!order) return { ok: false, error: "order_not_found" };

  // Block a second ACTIVE (non-terminal) request for the same order.
  const existing = await prisma.refundRequest.findFirst({
    where: {
      orderId: order.id,
      status: { notIn: [...TERMINAL_STATUSES] },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "duplicate_active", existingId: existing.id };

  const amount = Math.max(0, Math.round(input.requestedAmountMad ?? order.totalMad));
  const uploadedBy: RefundActorType = input.actor.type === "ADMIN" ? "ADMIN" : "CUSTOMER";

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.refundRequest.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: (input.phone ?? order.customer?.phone ?? null) || null,
        source: input.source,
        reason: input.reason,
        description: input.description.trim(),
        requestedAmountMad: amount,
        currency: "MAD",
        status: "REQUESTED",
      },
      select: { id: true, seq: true },
    });

    if (input.attachments?.length) {
      await tx.refundAttachment.createMany({
        data: input.attachments.map((a) => ({
          refundRequestId: request.id,
          uploadedBy,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      });
    }

    await recordRefundEvent(tx, {
      requestId: request.id,
      type: "requested",
      actor: input.actor,
      metadata: { source: input.source, reason: input.reason, amountMad: amount },
    });

    return request;
  });

  const orderRef = await publicOrderReference({ id: order.id, createdAt: order.createdAt });
  return {
    ok: true,
    id: created.id,
    seq: created.seq,
    number: formatRefundNumber(created.seq),
    orderPublicNumber: orderRef.number,
  };
}

const TERMINAL_STATUSES: RefundStatus[] = [
  "REFUNDED",
  "CREDITED",
  "REPLACED",
  "NOT_ELIGIBLE",
  "CANCELLED",
];

/** The active (non-terminal) request for an order, if any. */
export async function getActiveRefundForOrder(orderId: string): Promise<{
  id: string;
  seq: number;
  number: string;
  status: RefundStatus;
  createdAt: string;
} | null> {
  await ensureDatabaseReady();
  const row = await prisma.refundRequest.findFirst({
    where: { orderId, status: { notIn: [...TERMINAL_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, seq: true, status: true, createdAt: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    seq: row.seq,
    number: formatRefundNumber(row.seq),
    status: row.status as RefundStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/** All requests for an order (customer page + admin order detail), newest first. */
export async function listRefundsForOrder(orderId: string): Promise<RefundOrderSummary[]> {
  await ensureDatabaseReady();
  const rows = await prisma.refundRequest.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      seq: true,
      status: true,
      reason: true,
      requestedAmountMad: true,
      currency: true,
      createdAt: true,
      resolution: { select: { type: true, amountMad: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: formatRefundNumber(r.seq),
    status: r.status as RefundStatus,
    reason: r.reason as RefundReason,
    amountMad: r.requestedAmountMad,
    currency: r.currency,
    createdAt: r.createdAt.toISOString(),
    resolutionType: (r.resolution?.type as RefundResolutionType | undefined) ?? null,
  }));
}

export type RefundOrderSummary = {
  id: string;
  number: string;
  status: RefundStatus;
  reason: RefundReason;
  amountMad: number;
  currency: string;
  createdAt: string;
  resolutionType: RefundResolutionType | null;
};

// ── State machine ────────────────────────────────────────────────────────────
type TransitionResult =
  | { ok: true; status: RefundStatus }
  | { ok: false; error: "not_found" | "illegal_transition"; current?: RefundStatus };

/**
 * Apply a validated status change plus its milestone timestamp. `extra` sets
 * additional fields atomically (eligibility decision, rejection reason, offered
 * resolutions...). Records a timeline event.
 */
export async function transitionRefund(input: {
  requestId: string;
  to: RefundStatus;
  actor: RefundActor;
  eventType: string;
  eventMetadata?: Prisma.InputJsonValue;
  extra?: Prisma.RefundRequestUpdateManyMutationInput;
  tx?: Tx;
}): Promise<TransitionResult> {
  const run = async (tx: Tx): Promise<TransitionResult> => {
    const current = await tx.refundRequest.findUnique({
      where: { id: input.requestId },
      select: { status: true },
    });
    if (!current) return { ok: false, error: "not_found" };
    const from = current.status as RefundStatus;
    if (from === input.to) {
      // Idempotent no-op: already there (e.g. retried admin action).
      return { ok: true, status: from };
    }
    if (!canTransition(from, input.to)) {
      return { ok: false, error: "illegal_transition", current: from };
    }

    const now = new Date();
    const stamps: Prisma.RefundRequestUpdateManyMutationInput = {};
    if (input.to === "UNDER_REVIEW") stamps.reviewedAt = now;
    if (input.to === "APPROVED_AWAITING_CHOICE") stamps.approvedAt = now;
    if (input.to === "CHOICE_RECEIVED") stamps.customerChoiceAt = now;
    if (["REFUNDED", "CREDITED", "REPLACED"].includes(input.to)) stamps.processedAt = now;
    if (isRefundTerminal(input.to)) stamps.closedAt = now;

    const updated = await tx.refundRequest.updateMany({
      where: { id: input.requestId, status: from },
      data: { status: input.to, ...stamps, ...(input.extra ?? {}) },
    });
    if (updated.count !== 1) {
      const latest = await tx.refundRequest.findUnique({
        where: { id: input.requestId },
        select: { status: true },
      });
      if (latest?.status === input.to) return { ok: true, status: input.to };
      return {
        ok: false,
        error: latest ? "illegal_transition" : "not_found",
        current: latest?.status as RefundStatus | undefined,
      };
    }
    await recordRefundEvent(tx, {
      requestId: input.requestId,
      type: input.eventType,
      actor: input.actor,
      metadata: input.eventMetadata,
    });
    return { ok: true, status: input.to };
  };

  await ensureDatabaseReady();
  return input.tx ? run(input.tx) : prisma.$transaction(run);
}

// ── Notes / messages / attachments ───────────────────────────────────────────
export async function addRefundNote(input: {
  requestId: string;
  authorId: string;
  authorName: string;
  body: string;
}): Promise<{ ok: boolean }> {
  await ensureDatabaseReady();
  const body = input.body.trim();
  if (!body) return { ok: false };
  await prisma.$transaction(async (tx) => {
    await tx.refundNote.create({
      data: {
        refundRequestId: input.requestId,
        authorId: input.authorId,
        authorName: input.authorName,
        body,
      },
    });
    await recordRefundEvent(tx, {
      requestId: input.requestId,
      type: "note_added",
      actor: { type: "ADMIN", id: input.authorId, name: input.authorName },
    });
  });
  return { ok: true };
}

export async function addRefundMessage(input: {
  requestId: string;
  channel: RefundMessageChannel;
  templateKey?: string | null;
  subject?: string | null;
  body: string;
  actor: RefundActor;
  deliveryResult?: string | null;
  emailLogId?: string | null;
  eventType?: string;
  tx?: Tx;
}): Promise<void> {
  const run = async (tx: Tx) => {
    await tx.refundMessage.create({
      data: {
        refundRequestId: input.requestId,
        channel: input.channel,
        templateKey: input.templateKey ?? null,
        subject: input.subject ?? null,
        body: input.body,
        sentById: input.actor.id ?? null,
        sentByName: input.actor.name ?? null,
        deliveryResult: input.deliveryResult ?? null,
        emailLogId: input.emailLogId ?? null,
      },
    });
    await recordRefundEvent(tx, {
      requestId: input.requestId,
      type: input.eventType ?? (input.channel === "WHATSAPP" ? "whatsapp_opened" : "email_sent"),
      actor: input.actor,
      metadata: { channel: input.channel, templateKey: input.templateKey ?? undefined },
    });
  };
  await ensureDatabaseReady();
  if (input.tx) return run(input.tx);
  await prisma.$transaction(run);
}

export async function addRefundAttachments(
  requestId: string,
  attachments: { url: string; fileName: string; mimeType: string; sizeBytes: number }[],
  uploadedBy: RefundActorType,
): Promise<void> {
  if (!attachments.length) return;
  await ensureDatabaseReady();
  await prisma.refundAttachment.createMany({
    data: attachments.map((a) => ({
      refundRequestId: requestId,
      uploadedBy,
      url: a.url,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  });
}

// ── Secure customer tokens (info + resolution links) ─────────────────────────
const REFUND_TOKEN_TTL_DAYS = 14;
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * Mint a single-purpose, single-request, expiring token. Only the hash is
 * stored. Any prior unused token of the same purpose for this request is
 * invalidated so a re-send supersedes the old link.
 */
export async function createRefundActionToken(
  requestId: string,
  purpose: RefundTokenPurpose,
): Promise<string> {
  await ensureDatabaseReady();
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFUND_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.refundActionToken.updateMany({
      where: { refundRequestId: requestId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.refundActionToken.create({
      data: { refundRequestId: requestId, purpose, tokenHash: hashToken(raw), expiresAt },
    });
  });
  return raw;
}

/** Validate a raw token for page load — returns the scope, never marks it used. */
export async function resolveRefundActionToken(
  raw: string,
): Promise<{ requestId: string; purpose: RefundTokenPurpose } | null> {
  await ensureDatabaseReady();
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const row = await prisma.refundActionToken.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    select: { refundRequestId: true, purpose: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  return { requestId: row.refundRequestId, purpose: row.purpose as RefundTokenPurpose };
}

/** Consume a token inside a transaction — single-use guard for submit actions. */
async function consumeRefundActionToken(
  tx: Tx,
  raw: string,
  purpose: RefundTokenPurpose,
): Promise<string | null> {
  const row = await tx.refundActionToken.findUnique({
    where: { tokenHash: hashToken(raw.trim()) },
    select: { id: true, refundRequestId: true, purpose: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  const consumed = await tx.refundActionToken.updateMany({
    where: {
      id: row.id,
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return null;
  return row.refundRequestId;
}

// ── Customer info submission (INFORMATION_REQUIRED → CUSTOMER_RESPONDED) ──────
export async function submitCustomerInformation(input: {
  token: string;
  attachments: { url: string; fileName: string; mimeType: string; sizeBytes: number }[];
  message?: string | null;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: "invalid_token" | "wrong_state" }> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    const requestId = await consumeRefundActionToken(tx, input.token, "PROVIDE_INFO");
    if (!requestId) return { ok: false as const, error: "invalid_token" as const };

    const req = await tx.refundRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    if (!req || req.status !== "INFORMATION_REQUIRED") {
      return { ok: false as const, error: "wrong_state" as const };
    }

    if (input.attachments.length) {
      await tx.refundAttachment.createMany({
        data: input.attachments.map((a) => ({
          refundRequestId: requestId,
          uploadedBy: "CUSTOMER" as RefundActorType,
          url: a.url,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      });
    }
    const note = input.message?.trim();
    if (note) {
      await tx.refundMessage.create({
        data: {
          refundRequestId: requestId,
          channel: "SYSTEM",
          body: note,
          sentByName: "Client",
        },
      });
    }
    const result = await transitionRefund({
      requestId,
      to: "CUSTOMER_RESPONDED",
      actor: { type: "CUSTOMER", name: "Client" },
      eventType: "info_received",
      eventMetadata: { attachments: input.attachments.length },
      tx,
    });
    if (!result.ok) return { ok: false as const, error: "wrong_state" as const };
    return { ok: true as const, requestId };
  });
}

// ── Customer resolution choice (APPROVED_AWAITING_CHOICE → CHOICE_RECEIVED) ───
export async function submitResolutionChoice(input: {
  token: string;
  type: RefundResolutionType;
  selectedVariantId?: string | null;
  replacementLabel?: string | null;
  selectedProductId?: string | null;
  supportRating?: "up" | "down" | null;
  supportComment?: string | null;
  /** Verified customer id when a guest signed in to claim Ghost Credit. */
  linkCustomerId?: string | null;
}): Promise<
  | { ok: true; requestId: string }
  | { ok: false; error: "invalid_token" | "wrong_state" | "not_offered" | "needs_account" }
> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    const requestId = await consumeRefundActionToken(tx, input.token, "CHOOSE_RESOLUTION");
    if (!requestId) return { ok: false as const, error: "invalid_token" as const };

    const req = await tx.refundRequest.findUnique({
      where: { id: requestId },
      select: {
        status: true,
        customerId: true,
        offeredResolutions: true,
        requestedAmountMad: true,
        currency: true,
        order: { select: { paymentMethod: true } },
      },
    });
    if (!req || req.status !== "APPROVED_AWAITING_CHOICE") {
      return { ok: false as const, error: "wrong_state" as const };
    }
    if (!req.offeredResolutions.includes(input.type)) {
      return { ok: false as const, error: "not_offered" as const };
    }

    // Ghost Credit needs a real account to hold the balance.
    let customerId = req.customerId;
    if (input.type === "GHOST_CREDIT") {
      customerId = customerId ?? input.linkCustomerId ?? null;
      if (!customerId) return { ok: false as const, error: "needs_account" as const };
      if (!req.customerId && input.linkCustomerId) {
        await tx.refundRequest.update({
          where: { id: requestId },
          data: { customerId: input.linkCustomerId },
        });
      }
    }

    await tx.refundResolution.upsert({
      where: { refundRequestId: requestId },
      create: {
        refundRequestId: requestId,
        type: input.type,
        amountMad: req.requestedAmountMad,
        currency: req.currency,
        selectedVariantId: input.selectedVariantId ?? null,
        selectedProductId: input.selectedProductId ?? null,
        replacementLabel: input.replacementLabel ?? null,
        originalPaymentMethod:
          input.type === "ORIGINAL_PAYMENT_METHOD" ? req.order.paymentMethod : null,
        selectedByCustomer: true,
        selectedAt: new Date(),
      },
      update: {
        type: input.type,
        selectedVariantId: input.selectedVariantId ?? null,
        selectedProductId: input.selectedProductId ?? null,
        replacementLabel: input.replacementLabel ?? null,
        originalPaymentMethod:
          input.type === "ORIGINAL_PAYMENT_METHOD" ? req.order.paymentMethod : null,
        selectedAt: new Date(),
      },
    });

    if (input.supportRating || input.supportComment) {
      await tx.refundRequest.update({
        where: { id: requestId },
        data: {
          supportRating: input.supportRating ?? null,
          supportComment: input.supportComment?.trim() || null,
        },
      });
    }

    const result = await transitionRefund({
      requestId,
      to: "CHOICE_RECEIVED",
      actor: { type: "CUSTOMER", name: "Client" },
      eventType: "choice_submitted",
      eventMetadata: { type: input.type },
      tx,
    });
    if (!result.ok) return { ok: false as const, error: "wrong_state" as const };
    return { ok: true as const, requestId };
  });
}

// ── Admin processing ─────────────────────────────────────────────────────────
/** Mark an original-payment-method refund as sent. Idempotent via status. */
export async function markRefundSent(input: {
  requestId: string;
  actor: RefundActor;
  amountMad: number;
  method: string;
  transactionReference?: string | null;
  processedDate?: Date | null;
  proofUrl?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: "wrong_state" | "not_found" }> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    const req = await tx.refundRequest.findUnique({
      where: { id: input.requestId },
      select: {
        status: true,
        resolution: { select: { id: true, type: true, amountMad: true } },
      },
    });
    if (!req) return { ok: false, error: "not_found" as const };
    if (req.status === "REFUNDED") return { ok: true }; // idempotent
    if (
      !["CHOICE_RECEIVED", "REFUND_PROCESSING"].includes(req.status) ||
      !req.resolution ||
      req.resolution.type !== "ORIGINAL_PAYMENT_METHOD" ||
      settledStatusForResolution(req.resolution.type as RefundResolutionType) !== "REFUNDED"
    ) {
      return { ok: false, error: "wrong_state" as const };
    }
    if (input.amountMad !== req.resolution.amountMad || !input.method.trim()) {
      return { ok: false, error: "wrong_state" as const };
    }

    await tx.refundResolution.update({
      where: { refundRequestId: input.requestId },
      data: {
        transactionReference: input.transactionReference?.trim() || null,
        proofUrl: input.proofUrl ?? null,
        processingNote: input.note?.trim() || null,
        processedById: input.actor.id ?? null,
        processedByName: input.actor.name ?? null,
        processedAt: input.processedDate ?? new Date(),
      },
    });

    const result = await transitionRefund({
      requestId: input.requestId,
      to: "REFUNDED",
      actor: input.actor,
      eventType: "refund_sent",
      eventMetadata: { amountMad: input.amountMad, method: input.method },
      tx,
    });
    return result.ok ? { ok: true } : { ok: false, error: "wrong_state" as const };
  });
}

/**
 * Issue Ghost Credit for a GHOST_CREDIT resolution. The grant is idempotency-
 * keyed on the request id, so a double click can never double-credit.
 */
export async function issueGhostCreditRefund(input: {
  requestId: string;
  actor: RefundActor;
}): Promise<{ ok: boolean; error?: "wrong_state" | "not_found" | "no_account" }> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    const req = await tx.refundRequest.findUnique({
      where: { id: input.requestId },
      select: {
        seq: true,
        status: true,
        customerId: true,
        orderId: true,
        resolution: { select: { id: true, type: true, amountMad: true } },
      },
    });
    if (!req) return { ok: false, error: "not_found" as const };
    if (req.status === "CREDITED") return { ok: true }; // idempotent
    if (req.status !== "CHOICE_RECEIVED" || req.resolution?.type !== "GHOST_CREDIT") {
      return { ok: false, error: "wrong_state" as const };
    }
    if (!req.customerId) return { ok: false, error: "no_account" as const };

    const grant = await grantCreditTx(tx, {
      customerId: req.customerId,
      amountMad: req.resolution.amountMad,
      reason: "refund_credit",
      idempotencyKey: `refund-credit:${input.requestId}`,
      orderId: req.orderId,
      source: input.actor.name ?? "admin",
      note: `Remboursement ${formatRefundNumber(req.seq)}`,
    });

    const txnId = await tx.ghostCreditTransaction.findUnique({
      where: { idempotencyKey: `refund-credit:${input.requestId}` },
      select: { id: true },
    });
    await tx.refundResolution.update({
      where: { refundRequestId: input.requestId },
      data: {
        ghostCreditTxnId: txnId?.id ?? null,
        processedById: input.actor.id ?? null,
        processedByName: input.actor.name ?? null,
        processedAt: new Date(),
      },
    });

    const result = await transitionRefund({
      requestId: input.requestId,
      to: "CREDITED",
      actor: input.actor,
      eventType: "credit_issued",
      eventMetadata: { amountMad: req.resolution.amountMad, duplicate: grant.duplicate },
      tx,
    });
    return result.ok ? { ok: true } : { ok: false, error: "wrong_state" as const };
  });
}

/** Move a replacement choice into fulfilment (CHOICE_RECEIVED → REPLACEMENT_PENDING). */
export async function startReplacement(input: {
  requestId: string;
  actor: RefundActor;
}): Promise<{ ok: boolean; error?: string }> {
  await ensureDatabaseReady();
  const req = await prisma.refundRequest.findUnique({
    where: { id: input.requestId },
    select: { status: true, resolution: { select: { type: true } } },
  });
  if (
    !req ||
    req.status !== "CHOICE_RECEIVED" ||
    req.resolution?.type !== "REPLACEMENT_PRODUCT"
  ) {
    return { ok: false, error: req ? "wrong_state" : "not_found" };
  }
  const result = await transitionRefund({
    requestId: input.requestId,
    to: "REPLACEMENT_PENDING",
    actor: input.actor,
    eventType: "replacement_selected",
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Confirm the replacement was delivered (REPLACEMENT_PENDING → REPLACED). */
export async function markReplacementDelivered(input: {
  requestId: string;
  actor: RefundActor;
  replacementOrderId?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    await tx.refundResolution.updateMany({
      where: { refundRequestId: input.requestId },
      data: {
        replacementOrderId: input.replacementOrderId ?? undefined,
        processingNote: input.note?.trim() || undefined,
        processedById: input.actor.id ?? undefined,
        processedByName: input.actor.name ?? undefined,
        processedAt: new Date(),
      },
    });
    const result = await transitionRefund({
      requestId: input.requestId,
      to: "REPLACED",
      actor: input.actor,
      eventType: "replacement_delivered",
      tx,
    });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  });
}

/** Close a settled/terminal case (sets closedAt; keeps the terminal status). */
export async function closeRefundCase(input: {
  requestId: string;
  actor: RefundActor;
}): Promise<{ ok: boolean }> {
  await ensureDatabaseReady();
  const req = await prisma.refundRequest.findUnique({
    where: { id: input.requestId },
    select: { status: true, closedAt: true },
  });
  if (!req || !isRefundTerminal(req.status) || req.closedAt) return { ok: false };
  await prisma.$transaction(async (tx) => {
    await tx.refundRequest.update({
      where: { id: input.requestId },
      data: { closedAt: new Date() },
    });
    await recordRefundEvent(tx, {
      requestId: input.requestId,
      type: "closed",
      actor: input.actor,
    });
  });
  return { ok: true };
}

// ── Admin review transitions (thin wrappers over transitionRefund) ───────────
export async function startRefundReview(requestId: string, actor: RefundActor) {
  return transitionRefund({
    requestId,
    to: "UNDER_REVIEW",
    actor,
    eventType: "review_started",
  });
}

export async function requestRefundInformation(requestId: string, actor: RefundActor) {
  return transitionRefund({
    requestId,
    to: "INFORMATION_REQUIRED",
    actor,
    eventType: "info_requested",
  });
}

export async function approveRefundRequest(input: {
  requestId: string;
  actor: RefundActor;
  offeredResolutions: RefundResolutionType[];
  allowSameVariantReplacement: boolean;
}) {
  return transitionRefund({
    requestId: input.requestId,
    to: "APPROVED_AWAITING_CHOICE",
    actor: input.actor,
    eventType: "approved",
    eventMetadata: { offeredResolutions: input.offeredResolutions },
    extra: {
      eligibilityDecision: "eligible",
      offeredResolutions: input.offeredResolutions,
      allowSameVariantReplacement: input.allowSameVariantReplacement,
    },
  });
}

export async function rejectRefundRequest(input: {
  requestId: string;
  actor: RefundActor;
  rejectionReason: string;
}) {
  return transitionRefund({
    requestId: input.requestId,
    to: "NOT_ELIGIBLE",
    actor: input.actor,
    eventType: "rejected",
    eventMetadata: { rejectionReason: input.rejectionReason },
    extra: { eligibilityDecision: "not_eligible", rejectionReason: input.rejectionReason.trim() },
  });
}

export async function cancelRefundRequest(requestId: string, actor: RefundActor) {
  return transitionRefund({
    requestId,
    to: "CANCELLED",
    actor,
    eventType: "cancelled",
  });
}

export async function reopenRefundRequest(requestId: string, actor: RefundActor) {
  return transitionRefund({
    requestId,
    to: "UNDER_REVIEW",
    actor,
    eventType: "review_started",
    eventMetadata: { reopened: true },
    extra: { closedAt: null, eligibilityDecision: null, rejectionReason: null },
  });
}

export async function assignRefundAdmin(input: {
  requestId: string;
  adminId: string;
  adminName: string;
}): Promise<void> {
  await ensureDatabaseReady();
  await prisma.refundRequest.update({
    where: { id: input.requestId },
    data: { assignedAdminId: input.adminId, assignedAdminName: input.adminName },
  });
}

export { isRefundActive };
