"use server";

import { authorizeOrderAccess, publicOrderReference } from "@/lib/db/orders";
import {
  createRefundRequest,
  getActiveRefundForOrder,
  listRefundsForOrder,
  resolveRefundActionToken,
  submitCustomerInformation,
  submitResolutionChoice,
  type RefundOrderSummary,
} from "@/lib/db/refunds";
import { listReplacementVariants, type ReplacementVariant } from "@/lib/db/refundsQuery";
import { isRefundReason, refundStatusLabel } from "@/lib/refunds/status";
import { notifyRefundEvent } from "@/lib/discord/notify";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { getCurrentCustomer } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import type { RefundReason, RefundResolutionType, RefundTokenPurpose } from "@/lib/types";

/**
 * Customer-facing refund actions (order page). Every action authorizes the
 * caller against the order via `authorizeOrderAccess` (secret token, internal
 * id, or logged-in owner) — the enumerable public order number never suffices,
 * so a guest can only act on the order whose link they hold. Nothing here
 * promises eligibility: a request is created for admin review.
 */

/** Order statuses for which a refund request makes sense (something was paid). */
const REFUNDABLE_ORDER_STATUSES = new Set(["payment_confirmed", "delivered"]);

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

export type RefundAttachmentInput = {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type CustomerRefundSummary = {
  canRequest: boolean;
  /** Why a request can't be made now (for copy), when canRequest is false. */
  blockedReason: "not_paid" | "active_request" | null;
  activeRequest: {
    id: string;
    number: string;
    status: string;
    statusLabel: string;
    createdAt: string;
  } | null;
  requests: (RefundOrderSummary & { statusLabel: string })[];
};

export async function getOrderRefundSummaryAction(
  orderRef: string,
): Promise<CustomerRefundSummary | null> {
  const orderId = await authorizeOrderAccess(orderRef);
  if (!orderId) return null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) return null;

  const [active, all] = await Promise.all([
    getActiveRefundForOrder(orderId),
    listRefundsForOrder(orderId),
  ]);

  const paid = REFUNDABLE_ORDER_STATUSES.has(order.status);
  const blockedReason: CustomerRefundSummary["blockedReason"] = !paid
    ? "not_paid"
    : active
      ? "active_request"
      : null;

  return {
    canRequest: paid && !active,
    blockedReason,
    activeRequest: active
      ? {
          id: active.id,
          number: active.number,
          status: active.status,
          statusLabel: refundStatusLabel(active.status),
          createdAt: active.createdAt,
        }
      : null,
    requests: all.map((r) => ({ ...r, statusLabel: refundStatusLabel(r.status) })),
  };
}

export type RequestRefundResult =
  | { ok: true; number: string; id: string }
  | { ok: false; error: string };

export async function requestRefundAction(input: {
  orderRef: string;
  reason: string;
  description: string;
  phone?: string | null;
  attachments?: RefundAttachmentInput[];
}): Promise<RequestRefundResult> {
  const orderId = await authorizeOrderAccess(input.orderRef);
  if (!orderId) return { ok: false, error: "Accès non autorisé à cette commande." };

  if (!isRefundReason(input.reason)) {
    return { ok: false, error: "Motif invalide." };
  }
  const description = (input.description ?? "").trim();
  if (description.length < 10) {
    return { ok: false, error: "Merci de décrire le problème (au moins 10 caractères)." };
  }
  if (description.length > 4000) {
    return { ok: false, error: "Description trop longue." };
  }

  // Only a paid order can be refunded.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order || !REFUNDABLE_ORDER_STATUSES.has(order.status)) {
    return { ok: false, error: "Cette commande n’est pas éligible à une demande de remboursement." };
  }

  const attachments = sanitizeAttachments(input.attachments);
  if (attachments === null) {
    return { ok: false, error: "Une pièce jointe est invalide." };
  }

  const result = await createRefundRequest({
    orderId,
    source: "CUSTOMER_ORDER_PAGE",
    reason: input.reason as RefundReason,
    description,
    phone: input.phone?.trim() || null,
    attachments,
    actor: { type: "CUSTOMER", name: "Client" },
  });

  if (!result.ok) {
    if (result.error === "duplicate_active") {
      return {
        ok: false,
        error:
          "Une demande de remboursement est déjà en cours pour cette commande. Notre équipe la traite.",
      };
    }
    return { ok: false, error: "Impossible de créer la demande." };
  }

  // Notify admins (never blocks the request).
  try {
    await notifyRefundEvent({
      kind: "requested",
      refundNumber: result.number,
      orderNumber: result.orderPublicNumber,
      customerName: "Client",
      statusLabel: refundStatusLabel("REQUESTED"),
      url: absoluteAppUrl(`/admin/refunds/${result.id}`),
    });
  } catch {
    /* notification is best-effort */
  }

  return { ok: true, number: result.number, id: result.id };
}

// ── Secure token pages (provide info / choose resolution) ────────────────────
export type RefundTokenContext = {
  purpose: RefundTokenPurpose;
  refundNumber: string;
  orderNumber: string;
  amountMad: number;
  currency: string;
  customerName: string;
  /** PROVIDE_INFO: the exact request text sent to the customer (if any). */
  requestedInfo: string | null;
  /** CHOOSE_RESOLUTION fields. */
  offeredResolutions: RefundResolutionType[];
  originalPaymentMethodLabel: string | null;
  isGuest: boolean;
  /** Whether the signed-in visitor's account matches the order (Ghost Credit). */
  accountMatches: boolean;
  replacementVariants: ReplacementVariant[];
};

/** Public but token-gated: reveal only the minimum needed for the page. */
export async function getRefundTokenContextAction(
  token: string,
): Promise<RefundTokenContext | null> {
  const scope = await resolveRefundActionToken(token);
  if (!scope) return null;

  const req = await prisma.refundRequest.findUnique({
    where: { id: scope.requestId },
    select: {
      seq: true,
      status: true,
      customerId: true,
      customerName: true,
      customerEmail: true,
      requestedAmountMad: true,
      currency: true,
      offeredResolutions: true,
      allowSameVariantReplacement: true,
      orderId: true,
      order: {
        select: {
          createdAt: true,
          paymentMethod: true,
          items: { select: { variantId: true }, take: 1 },
        },
      },
      messages: {
        where: { templateKey: "info_required", channel: "EMAIL" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });
  if (!req) return null;

  // The page only makes sense in the matching workflow state.
  if (scope.purpose === "PROVIDE_INFO" && req.status !== "INFORMATION_REQUIRED") return null;
  if (scope.purpose === "CHOOSE_RESOLUTION" && req.status !== "APPROVED_AWAITING_CHOICE") return null;

  const { formatRefundNumber } = await import("@/lib/refunds/status");
  const orderRef = await publicOrderReference({ id: req.orderId, createdAt: req.order.createdAt });

  const offered = req.offeredResolutions as RefundResolutionType[];
  let replacementVariants: ReplacementVariant[] = [];
  if (scope.purpose === "CHOOSE_RESOLUTION" && offered.includes("REPLACEMENT_PRODUCT")) {
    replacementVariants = await listReplacementVariants(req.requestedAmountMad, {
      excludeVariantId: req.order.items[0]?.variantId ?? null,
      allowSameVariant: req.allowSameVariantReplacement,
    });
  }

  // Original payment-method label (never sensitive account data).
  let originalPaymentMethodLabel: string | null = null;
  if (scope.purpose === "CHOOSE_RESOLUTION" && offered.includes("ORIGINAL_PAYMENT_METHOD")) {
    const { getAdminPaymentMethods } = await import("@/lib/db/paymentMethods");
    const { resolveOrderPaymentMethod } = await import("@/lib/paymentMethod");
    try {
      const { methods } = await getAdminPaymentMethods();
      originalPaymentMethodLabel =
        resolveOrderPaymentMethod(req.order.paymentMethod, methods)?.name || req.order.paymentMethod;
    } catch {
      originalPaymentMethodLabel = req.order.paymentMethod;
    }
  }

  const current = await getCurrentCustomer();
  const accountMatches =
    !!current && current.email.toLowerCase() === req.customerEmail.toLowerCase();

  return {
    purpose: scope.purpose,
    refundNumber: formatRefundNumber(req.seq),
    orderNumber: orderRef.number,
    amountMad: req.requestedAmountMad,
    currency: req.currency,
    customerName: req.customerName,
    requestedInfo: req.messages[0]?.body ?? null,
    offeredResolutions: offered,
    originalPaymentMethodLabel,
    isGuest: !req.customerId,
    accountMatches,
    replacementVariants,
  };
}

export async function submitRefundInfoAction(input: {
  token: string;
  attachments?: RefundAttachmentInput[];
  message?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const attachments = sanitizeAttachments(input.attachments);
  if (attachments === null) return { ok: false, error: "Une pièce jointe est invalide." };
  if (attachments.length === 0 && !input.message?.trim()) {
    return { ok: false, error: "Ajoutez une capture d’écran ou un message." };
  }
  const res = await submitCustomerInformation({
    token: input.token,
    attachments,
    message: input.message ?? null,
  });
  if (!res.ok) {
    return { ok: false, error: "Ce lien n’est plus valide." };
  }

  try {
    const req = await prisma.refundRequest.findUnique({
      where: { id: res.requestId },
      select: { seq: true, customerName: true, orderId: true, order: { select: { createdAt: true } } },
    });
    if (req) {
      const { formatRefundNumber } = await import("@/lib/refunds/status");
      const orderRef = await publicOrderReference({ id: req.orderId, createdAt: req.order.createdAt });
      await notifyRefundEvent({
        kind: "info_received",
        refundNumber: formatRefundNumber(req.seq),
        orderNumber: orderRef.number,
        customerName: req.customerName,
        statusLabel: refundStatusLabel("CUSTOMER_RESPONDED"),
        url: absoluteAppUrl(`/admin/refunds/${res.requestId}`),
      });
    }
  } catch {
    /* best effort */
  }

  return { ok: true };
}

export async function submitRefundChoiceAction(input: {
  token: string;
  type: RefundResolutionType;
  selectedVariantId?: string | null;
  replacementLabel?: string | null;
  selectedProductId?: string | null;
  supportRating?: "up" | "down" | null;
  supportComment?: string | null;
}): Promise<{ ok: boolean; error?: string; needsAccount?: boolean }> {
  let selectedVariantId = input.selectedVariantId ?? null;
  let selectedProductId = input.selectedProductId ?? null;
  let replacementLabel = input.replacementLabel ?? null;

  if (input.type === "REPLACEMENT_PRODUCT") {
    const context = await getRefundTokenContextAction(input.token);
    const selected = context?.replacementVariants.find((v) => v.variantId === selectedVariantId);
    if (!selected) {
      return { ok: false, error: "Ce produit de remplacement n’est plus disponible." };
    }
    selectedVariantId = selected.variantId;
    selectedProductId = selected.productId;
    replacementLabel = `${selected.productName} · ${selected.variantName}`;
  }

  // Ghost Credit needs a real account; link the signed-in visitor only when
  // their email matches the order (verified ownership).
  let linkCustomerId: string | null = null;
  if (input.type === "GHOST_CREDIT") {
    const scope = await resolveRefundActionToken(input.token);
    if (scope) {
      const req = await prisma.refundRequest.findUnique({
        where: { id: scope.requestId },
        select: { customerId: true, customerEmail: true },
      });
      if (req && !req.customerId) {
        const current = await getCurrentCustomer();
        if (current && current.email.toLowerCase() === req.customerEmail.toLowerCase()) {
          linkCustomerId = current.id;
        } else {
          return { ok: false, needsAccount: true, error: "Connectez-vous pour recevoir le crédit." };
        }
      }
    }
  }

  const res = await submitResolutionChoice({
    token: input.token,
    type: input.type,
    selectedVariantId,
    replacementLabel,
    selectedProductId,
    supportRating: input.supportRating ?? null,
    supportComment: input.supportComment ?? null,
    linkCustomerId,
  });
  if (!res.ok) {
    if (res.error === "needs_account") return { ok: false, needsAccount: true };
    if (res.error === "not_offered") return { ok: false, error: "Cette option n’est pas disponible." };
    return { ok: false, error: "Ce lien n’est plus valide." };
  }

  try {
    const req = await prisma.refundRequest.findUnique({
      where: { id: res.requestId },
      select: { seq: true, customerName: true, orderId: true, order: { select: { createdAt: true } } },
    });
    if (req) {
      const { formatRefundNumber } = await import("@/lib/refunds/status");
      const orderRef = await publicOrderReference({ id: req.orderId, createdAt: req.order.createdAt });
      await notifyRefundEvent({
        kind: "choice_submitted",
        refundNumber: formatRefundNumber(req.seq),
        orderNumber: orderRef.number,
        customerName: req.customerName,
        statusLabel: refundStatusLabel("CHOICE_RECEIVED"),
        url: absoluteAppUrl(`/admin/refunds/${res.requestId}`),
      });
    }
  } catch {
    /* best effort */
  }

  return { ok: true };
}

function sanitizeAttachments(
  attachments: RefundAttachmentInput[] | undefined,
): { url: string; fileName: string; mimeType: string; sizeBytes: number }[] | null {
  if (!attachments?.length) return [];
  if (attachments.length > MAX_ATTACHMENTS) return null;
  const cleaned: { url: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
  for (const a of attachments) {
    if (!a || typeof a.url !== "string" || !a.url) return null;
    if (!ALLOWED_ATTACHMENT_TYPES.has(a.mimeType)) return null;
    if (typeof a.sizeBytes !== "number" || a.sizeBytes <= 0 || a.sizeBytes > MAX_ATTACHMENT_BYTES) {
      return null;
    }
    cleaned.push({
      url: a.url,
      fileName: (a.fileName || "piece-jointe").slice(0, 200),
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    });
  }
  return cleaned;
}
