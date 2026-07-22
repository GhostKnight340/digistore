"use server";

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import { getStoreSettings } from "@/lib/db/catalog";
import { sendRenderedEmail } from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { notifyRefundEvent } from "@/lib/discord/notify";
import { prisma } from "@/lib/db/prisma";
import {
  addRefundNote,
  addRefundMessage,
  approveRefundRequest,
  assignRefundAdmin,
  cancelRefundRequest,
  closeRefundCase,
  createRefundActionToken,
  createRefundRequest,
  issueGhostCreditRefund,
  markRefundSent,
  markReplacementDelivered,
  rejectRefundRequest,
  reopenRefundRequest,
  requestRefundInformation,
  startRefundReview,
  startReplacement,
  type RefundActor,
} from "@/lib/db/refunds";
import {
  getRefundCaseDetail,
  getRefundQueueCounts,
  listRefundRequests,
  type RefundQueueFilters,
} from "@/lib/db/refundsQuery";
import {
  refundEmailDefaults,
  refundTemplateLink,
  renderRefundEmail,
  type RefundEmailContext,
} from "@/lib/refunds/email";
import type { RefundEmailTemplateKey } from "@/lib/refunds/emailShared";
import { refundStatusLabel } from "@/lib/refunds/status";
import type { RefundReason, RefundResolutionType, RefundSource } from "@/lib/types";

/**
 * Admin refund actions. Every mutation re-checks admin access server-side
 * (requireAdminCustomer) — a hidden UI button is never the authority. All
 * status changes route through the validated state machine in
 * src/lib/db/refunds.ts.
 */

async function admin(): Promise<RefundActor> {
  const customer = await requireAdminCustomer();
  return { type: "ADMIN", id: customer.id, name: customer.name };
}

function revalidateRefund(id?: string) {
  revalidatePath("/admin/refunds");
  if (id) revalidatePath(`/admin/refunds/${id}`);
}

// ── Reads ────────────────────────────────────────────────────────────────────
export async function getRefundQueueAction(filters: RefundQueueFilters) {
  await requireAdminCustomer();
  return listRefundRequests(filters);
}

/** Refund requests attached to an order — for the admin order-detail panel. */
export async function getOrderRefundsAction(orderId: string) {
  await requireAdminCustomer();
  const { listRefundsForOrder } = await import("@/lib/db/refunds");
  const rows = await listRefundsForOrder(orderId);
  return rows.map((r) => ({ ...r, statusLabel: refundStatusLabel(r.status) }));
}

export async function getRefundCaseAction(id: string) {
  await requireAdminCustomer();
  return getRefundCaseDetail(id);
}

export async function getRefundCountsAction() {
  await requireAdminCustomer();
  return getRefundQueueCounts();
}

// ── Simple transitions ───────────────────────────────────────────────────────
export async function startRefundReviewAction(id: string) {
  const actor = await admin();
  const r = await startRefundReview(id, actor);
  revalidateRefund(id);
  return r;
}

export async function cancelRefundAction(id: string) {
  const actor = await admin();
  const r = await cancelRefundRequest(id, actor);
  revalidateRefund(id);
  return r;
}

export async function reopenRefundAction(id: string) {
  const actor = await admin();
  const r = await reopenRefundRequest(id, actor);
  revalidateRefund(id);
  return r;
}

export async function closeRefundAction(id: string) {
  const actor = await admin();
  const r = await closeRefundCase({ requestId: id, actor });
  revalidateRefund(id);
  return r;
}

export async function addRefundNoteAction(id: string, body: string) {
  const actor = await admin();
  const r = await addRefundNote({
    requestId: id,
    authorId: actor.id ?? "",
    authorName: actor.name ?? "Admin",
    body,
  });
  revalidateRefund(id);
  return r;
}

export async function assignRefundAction(id: string) {
  const actor = await admin();
  await assignRefundAdmin({ requestId: id, adminId: actor.id ?? "", adminName: actor.name ?? "Admin" });
  revalidateRefund(id);
  return { ok: true };
}

export async function logWhatsappOpenedAction(id: string) {
  const actor = await admin();
  await addRefundMessage({
    requestId: id,
    channel: "WHATSAPP",
    body: "Conversation WhatsApp ouverte par l’équipe.",
    actor,
    deliveryResult: "opened_externally",
  });
  revalidateRefund(id);
  return { ok: true };
}

// ── Processing ───────────────────────────────────────────────────────────────
export async function markRefundSentAction(
  id: string,
  input: {
    amountMad: number;
    method: string;
    transactionReference?: string;
    processedDate?: string;
    proofUrl?: string;
    note?: string;
    notify?: boolean;
  },
) {
  const actor = await admin();
  const r = await markRefundSent({
    requestId: id,
    actor,
    amountMad: input.amountMad,
    method: input.method,
    transactionReference: input.transactionReference,
    processedDate: input.processedDate ? new Date(input.processedDate) : null,
    proofUrl: input.proofUrl,
    note: input.note,
  });
  if (r.ok && input.notify) {
    await sendRefundEmailInternal(id, "refund_sent", actor, { method: input.method });
  }
  revalidateRefund(id);
  return r;
}

export async function issueGhostCreditAction(id: string, notify?: boolean) {
  const actor = await admin();
  const r = await issueGhostCreditRefund({ requestId: id, actor });
  if (r.ok && notify) {
    await sendRefundEmailInternal(id, "credit_issued", actor, {});
  }
  revalidateRefund(id);
  return r;
}

export async function startReplacementAction(id: string) {
  const actor = await admin();
  const r = await startReplacement({ requestId: id, actor });
  revalidateRefund(id);
  return r;
}

export async function markReplacementDeliveredAction(
  id: string,
  input: { replacementOrderId?: string; note?: string; notify?: boolean },
) {
  const actor = await admin();
  const r = await markReplacementDelivered({
    requestId: id,
    actor,
    replacementOrderId: input.replacementOrderId,
    note: input.note,
  });
  if (r.ok && input.notify) {
    await sendRefundEmailInternal(id, "replacement_delivered", actor, {});
  }
  revalidateRefund(id);
  return r;
}

// ── Email composer ───────────────────────────────────────────────────────────
export type RefundEmailPayload = {
  subject: string;
  body: string;
  /** info_required only. */
  customRequest?: string;
  /** not_eligible only. */
  rejectionReason?: string;
  /** approved only — which resolution choices to offer. */
  offeredResolutions?: RefundResolutionType[];
  allowSameVariantReplacement?: boolean;
};

async function loadEmailContext(id: string): Promise<{
  ctx: RefundEmailContext;
  customerEmail: string;
  customerId: string | null;
  orderId: string;
} | null> {
  const req = await prisma.refundRequest.findUnique({
    where: { id },
    select: {
      seq: true,
      customerName: true,
      customerEmail: true,
      customerId: true,
      requestedAmountMad: true,
      currency: true,
      orderId: true,
      order: { select: { createdAt: true } },
    },
  });
  if (!req) return null;
  const { publicOrderReference } = await import("@/lib/db/orders");
  const orderRef = await publicOrderReference({ id: req.orderId, createdAt: req.order.createdAt });
  const { formatRefundNumber } = await import("@/lib/refunds/status");
  return {
    ctx: {
      customerName: req.customerName,
      orderNumber: orderRef.number,
      refundNumber: formatRefundNumber(req.seq),
      amountMad: req.requestedAmountMad,
      currency: req.currency,
    },
    customerEmail: req.customerEmail,
    customerId: req.customerId,
    orderId: req.orderId,
  };
}

/** Editable defaults (subject/body) to prefill the composer for a template. */
export async function getRefundEmailDefaultsAction(
  id: string,
  templateKey: RefundEmailTemplateKey,
  hint?: { customRequest?: string; rejectionReason?: string },
) {
  await requireAdminCustomer();
  const loaded = await loadEmailContext(id);
  if (!loaded) return null;
  const ctx: RefundEmailContext = {
    ...loaded.ctx,
    customRequest: hint?.customRequest,
    rejectionReason: hint?.rejectionReason,
  };
  const d = refundEmailDefaults(templateKey, ctx);
  return { subject: d.subject, body: d.body, ctaLabel: d.ctaLabel, notice: d.notice };
}

/** Preview: render exactly what will be sent (no token minted — placeholder URL). */
export async function previewRefundEmailAction(
  id: string,
  templateKey: RefundEmailTemplateKey,
  payload: RefundEmailPayload,
) {
  await requireAdminCustomer();
  const loaded = await loadEmailContext(id);
  if (!loaded) return null;
  const settings = await getStoreSettings();
  const ctx: RefundEmailContext = {
    ...loaded.ctx,
    customRequest: payload.customRequest,
    rejectionReason: payload.rejectionReason,
  };
  const defaults = refundEmailDefaults(templateKey, ctx);
  const linkKind = refundTemplateLink(templateKey);
  const previewUrl = defaults.ctaLabel ? absoluteAppUrl("/refund/apercu-du-lien-securise") : null;
  const rendered = renderRefundEmail({
    subject: payload.subject || defaults.subject,
    body: payload.body || defaults.body,
    customerName: ctx.customerName,
    ctaLabel: defaults.ctaLabel,
    ctaUrl: previewUrl,
    notice: defaults.notice,
    motif: templateKey === "not_eligible" ? payload.rejectionReason || defaults.motif : defaults.motif,
    settings,
  });
  return { ...rendered, recipient: loaded.customerEmail, linkKind };
}

/** Resolve the real CTA URL for a template, minting a secure token when needed. */
async function resolveTemplateCtaUrl(
  id: string,
  templateKey: RefundEmailTemplateKey,
  orderId: string,
): Promise<string | null> {
  const kind = refundTemplateLink(templateKey);
  switch (kind) {
    case "PROVIDE_INFO": {
      const token = await createRefundActionToken(id, "PROVIDE_INFO");
      return absoluteAppUrl(`/refund/${token}`);
    }
    case "CHOOSE_RESOLUTION": {
      const token = await createRefundActionToken(id, "CHOOSE_RESOLUTION");
      return absoluteAppUrl(`/refund/${token}`);
    }
    case "WALLET":
      return absoluteAppUrl("/account/wallet");
    case "DELIVERY": {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { deliveryToken: true },
      });
      return absoluteAppUrl(order?.deliveryToken ? `/delivery/${order.deliveryToken}` : "/account");
    }
    case "ORDER":
    case null:
    default:
      return null;
  }
}

/** Shared send path used by the composer and the processing "notify" flags. */
async function sendRefundEmailInternal(
  id: string,
  templateKey: RefundEmailTemplateKey,
  actor: RefundActor,
  extra: { method?: string },
  payload?: RefundEmailPayload,
): Promise<{ ok: boolean; status?: string }> {
  const loaded = await loadEmailContext(id);
  if (!loaded) return { ok: false };
  const settings = await getStoreSettings();
  const ctx: RefundEmailContext = {
    ...loaded.ctx,
    method: extra.method,
    customRequest: payload?.customRequest,
    rejectionReason: payload?.rejectionReason,
  };
  const defaults = refundEmailDefaults(templateKey, ctx);
  const ctaUrl = defaults.ctaLabel ? await resolveTemplateCtaUrl(id, templateKey, loaded.orderId) : null;
  const rendered = renderRefundEmail({
    subject: payload?.subject || defaults.subject,
    body: payload?.body || defaults.body,
    customerName: ctx.customerName,
    ctaLabel: defaults.ctaLabel,
    ctaUrl,
    notice: defaults.notice,
    motif:
      templateKey === "not_eligible" ? payload?.rejectionReason || defaults.motif : defaults.motif,
    settings,
  });

  const result = await sendRenderedEmail({
    to: loaded.customerEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    customerId: loaded.customerId,
    orderId: loaded.orderId,
    type: "refund_case",
    templateKey,
  });

  await addRefundMessage({
    requestId: id,
    channel: "EMAIL",
    templateKey,
    subject: rendered.subject,
    body: rendered.text,
    actor,
    deliveryResult: result.status,
    emailLogId: result.logId ?? null,
  });

  return { ok: result.ok, status: result.status };
}

export async function sendRefundEmailAction(
  id: string,
  templateKey: RefundEmailTemplateKey,
  payload: RefundEmailPayload,
) {
  const actor = await admin();

  // Templates that drive a workflow transition do it BEFORE sending, so a failed
  // transition (illegal state) blocks the email.
  if (templateKey === "info_required") {
    const t = await requestRefundInformation(id, actor);
    if (!t.ok) return { ok: false, error: "Transition impossible dans cet état." };
  } else if (templateKey === "approved") {
    const offered = payload.offeredResolutions ?? [];
    if (offered.length === 0) return { ok: false, error: "Sélectionnez au moins une solution." };
    const t = await approveRefundRequest({
      requestId: id,
      actor,
      offeredResolutions: offered,
      allowSameVariantReplacement: payload.allowSameVariantReplacement ?? false,
    });
    if (!t.ok) return { ok: false, error: "Transition impossible dans cet état." };
  } else if (templateKey === "not_eligible") {
    const reason = payload.rejectionReason?.trim();
    if (!reason) return { ok: false, error: "Indiquez un motif de refus." };
    const t = await rejectRefundRequest({ requestId: id, actor, rejectionReason: reason });
    if (!t.ok) return { ok: false, error: "Transition impossible dans cet état." };
  }

  const sent = await sendRefundEmailInternal(id, templateKey, actor, {}, payload);
  revalidateRefund(id);
  return { ok: sent.ok, status: sent.status };
}

// ── Admin-created request ────────────────────────────────────────────────────
export async function createAdminRefundAction(input: {
  orderNumber?: string;
  orderId?: string;
  source: RefundSource;
  reason: RefundReason;
  description: string;
  requestedAmountMad?: number;
}): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const actor = await admin();

  // Resolve the order: admins may pass the internal id (from the order page) or
  // the public order number (#000008 / 8).
  let orderId = input.orderId ?? null;
  if (!orderId && input.orderNumber) {
    const seq = input.orderNumber.replace(/[^\d]/g, "");
    if (seq) {
      const rows = await prisma.order.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: Number(seq) - 1,
        take: 1,
        select: { id: true },
      });
      orderId = rows[0]?.id ?? null;
    }
  }
  if (!orderId) return { ok: false, error: "Commande introuvable." };

  const result = await createRefundRequest({
    orderId,
    source: input.source,
    reason: input.reason,
    description: input.description,
    requestedAmountMad: input.requestedAmountMad,
    actor,
  });
  if (!result.ok) {
    if (result.error === "duplicate_active") {
      return { ok: false, error: "Une demande active existe déjà pour cette commande." };
    }
    return { ok: false, error: "Création impossible." };
  }

  try {
    await notifyRefundEvent({
      kind: "requested",
      refundNumber: result.number,
      orderNumber: result.orderPublicNumber,
      customerName: "—",
      statusLabel: refundStatusLabel("REQUESTED"),
      amountLabel: result.ok ? undefined : undefined,
      url: absoluteAppUrl(`/admin/refunds/${result.id}`),
    });
  } catch {
    /* best effort */
  }

  revalidateRefund(result.id);
  return { ok: true, id: result.id, number: result.number };
}
