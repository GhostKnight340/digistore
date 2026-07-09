"use server";

import {
  submitPayment,
  changeOrderPaymentMethod,
  cancelOrder,
  approvePayment,
  rejectPayment,
  markPaymentIssue,
  getPaymentProof,
  renderPaymentStatusEmailPreview,
  applyPaymentStatusWithEmail,
} from "@/lib/db/payments";
import type { EmailTemplateKey } from "@/lib/emailTemplates";
import { getPublicPaymentMethods, getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { getCustomerOrder } from "@/lib/db/orders";
import { requireAdminCustomer } from "@/lib/auth";
import type {
  ActionResult,
  AdminPaymentProofDTO,
  PaymentConfigDTO,
  CustomerOrderDTO,
} from "@/lib/dto";

const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "application/pdf"]);
const PROOF_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};

export interface PaymentPageDataDTO {
  order: CustomerOrderDTO;
  config: PaymentConfigDTO;
}

/** Customer: fetch order + payment config in one shot for the payment page. */
export async function getPaymentPageDataAction(
  orderId: string,
): Promise<PaymentPageDataDTO | null> {
  const [order, config] = await Promise.all([
    getCustomerOrder(orderId),
    getPublicPaymentMethods(),
  ]);
  if (!order) return null;
  return { order, config };
}

/** Customer: submit payment (with optional proof file via FormData). */
export async function submitPaymentAction(formData: FormData): Promise<ActionResult> {
  const orderId = formData.get("orderId") as string | null;
  if (!orderId) return { ok: false, error: "Missing orderId." };

  const file = formData.get("proof") as File | null;
  let proof: { fileName: string; mimeType: string; dataBase64: string } | undefined;

  if (file && file.size > 0) {
    const mimeType = normalizeProofMimeType(file);
    if (!mimeType) {
      return { ok: false, error: "Format non supporté. Utilisez PNG, JPG, JPEG ou PDF." };
    }
    if (file.size > MAX_PROOF_SIZE_BYTES) {
      return { ok: false, error: "Fichier trop volumineux. Taille maximum: 5 Mo." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    proof = {
      fileName: file.name,
      mimeType,
      dataBase64: buffer.toString("base64"),
    };
  }

  return submitPayment(orderId, proof);
}

function normalizeProofMimeType(file: File): string | null {
  if (file.type && ALLOWED_PROOF_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return PROOF_TYPE_BY_EXTENSION[extension] ?? null;
}

/** Customer: switch a pending order to a different (customer-visible) method. */
export async function changePaymentMethodAction(
  orderId: string,
  methodId: string,
): Promise<ActionResult> {
  if (!orderId || !methodId) return { ok: false, error: "Paramètres manquants." };
  return changeOrderPaymentMethod(orderId, methodId);
}

/** Customer: cancel a still-unpaid order. Eligibility is enforced server-side. */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  if (!orderId) return { ok: false, error: "Paramètres manquants." };
  return cancelOrder(orderId);
}

// ─── Admin payment review actions ─────────────────────────────────────────────

export async function approvePaymentAction(orderId: string): Promise<ActionResult> {
  await requireAdminCustomer();
  return approvePayment(orderId);
}

export async function rejectPaymentAction(orderId: string): Promise<ActionResult> {
  await requireAdminCustomer();
  return rejectPayment(orderId);
}

export async function markPaymentIssueAction(orderId: string): Promise<ActionResult> {
  await requireAdminCustomer();
  return markPaymentIssue(orderId);
}

type ReviewIntent = "reject" | "request_proof" | "refund_update";
type ReviewEmailInput = { subject: string; message: string; reason: string };

function reviewTemplateKey(intent: ReviewIntent): EmailTemplateKey {
  return intent === "reject"
    ? "payment_rejected"
    : intent === "refund_update"
      ? "refund_update"
      : "new_proof_requested";
}

/**
 * Customer-facing reason shown in the email. For request-proof we NEVER invent a
 * default — an empty motif is simply omitted. Reject/refund keep their existing
 * default sentence so their behavior is unchanged.
 */
function effectiveReviewReason(intent: ReviewIntent, reason: string): string {
  const trimmed = reason.trim();
  if (trimmed) return trimmed;
  if (intent === "reject") return "Paiement refusé par l'admin.";
  if (intent === "refund_update") return "Mise à jour remboursement.";
  return "";
}

/** Internal timeline note (never shown to the customer). */
function reviewTimelineNote(intent: ReviewIntent, reason: string): string {
  const trimmed = reason.trim();
  if (trimmed) return trimmed;
  if (intent === "reject") return "Paiement refusé par l'admin.";
  if (intent === "refund_update") return "Mise à jour remboursement.";
  return "Nouveau justificatif demandé par l'admin.";
}

/** Initial defaults + preview for the review-email modal. */
export async function getPaymentEmailPreviewAction(
  orderId: string,
  intent: ReviewIntent,
): Promise<{ subject: string; message: string; reason: string; text: string; html: string }> {
  await requireAdminCustomer();
  const key = reviewTemplateKey(intent);
  const rendered = await renderPaymentStatusEmailPreview(
    orderId,
    key,
    effectiveReviewReason(intent, ""),
  );
  return {
    subject: rendered.subject,
    message: rendered.message,
    reason: "",
    text: rendered.text,
    html: rendered.html,
  };
}

/**
 * Live preview for the modal. Uses the exact same rendering path as the sent
 * email, so what the admin sees is what the customer receives.
 */
export async function renderPaymentReviewEmailAction(
  orderId: string,
  intent: ReviewIntent,
  input: ReviewEmailInput,
): Promise<{ subject: string; text: string; html: string }> {
  await requireAdminCustomer();
  const key = reviewTemplateKey(intent);
  const rendered = await renderPaymentStatusEmailPreview(
    orderId,
    key,
    effectiveReviewReason(intent, input.reason),
    { subject: input.subject, message: input.message },
  );
  return { subject: rendered.subject, text: rendered.text, html: rendered.html };
}

export async function sendPaymentReviewEmailAction(
  orderId: string,
  intent: ReviewIntent,
  input: ReviewEmailInput,
): Promise<ActionResult> {
  await requireAdminCustomer();
  const toStatus =
    intent === "reject" ? "rejected" : intent === "refund_update" ? "refunded" : "payment_issue";
  const emailType =
    intent === "reject"
      ? "payment_rejected"
      : intent === "refund_update"
        ? "refund_update"
        : "payment_issue";
  return applyPaymentStatusWithEmail(
    orderId,
    toStatus,
    reviewTimelineNote(intent, input.reason),
    emailType,
    reviewTemplateKey(intent),
    {
      subject: input.subject,
      message: input.message,
      reason: effectiveReviewReason(intent, input.reason),
    },
  );
}

/** Admin: fetch base64 proof for a given order. */
export async function getPaymentProofAction(
  orderId: string,
): Promise<AdminPaymentProofDTO | null> {
  await requireAdminCustomer();
  return getPaymentProof(orderId);
}

// ─── Payment settings actions ──────────────────────────────────────────────────

export async function getAdminPaymentConfigAction() {
  await requireAdminCustomer();
  return getAdminPaymentMethods();
}

export { getPublicPaymentMethods as getPaymentConfigAction };
