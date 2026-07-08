"use server";

import {
  submitPayment,
  selectOrderBankAccount,
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

  const bankAccountId = (formData.get("bankAccountId") as string | null) || null;

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

  return submitPayment(orderId, proof, bankAccountId);
}

/** Customer: record/lock the bank account chosen on the payment page. */
export async function selectOrderBankAccountAction(
  orderId: string,
  bankAccountId: string,
): Promise<ActionResult> {
  return selectOrderBankAccount(orderId, bankAccountId);
}

function normalizeProofMimeType(file: File): string | null {
  if (file.type && ALLOWED_PROOF_TYPES.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return PROOF_TYPE_BY_EXTENSION[extension] ?? null;
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

export async function getPaymentEmailPreviewAction(
  orderId: string,
  intent: "reject" | "request_proof" | "refund_update",
): Promise<{ subject: string; text: string; html: string }> {
  await requireAdminCustomer();
  const key: EmailTemplateKey =
    intent === "reject"
      ? "payment_rejected"
      : intent === "refund_update"
        ? "refund_update"
        : "new_proof_requested";
  return renderPaymentStatusEmailPreview(orderId, key, "");
}

export async function sendPaymentReviewEmailAction(
  orderId: string,
  intent: "reject" | "request_proof" | "refund_update",
  email: { subject: string; text: string; html?: string },
  reason?: string,
): Promise<ActionResult> {
  await requireAdminCustomer();
  if (intent === "reject") {
    return applyPaymentStatusWithEmail(
      orderId,
      "rejected",
      reason || "Paiement refusé par l'admin.",
      "payment_rejected",
      "payment_rejected",
      email,
    );
  }
  if (intent === "refund_update") {
    return applyPaymentStatusWithEmail(
      orderId,
      "refunded",
      reason || "Mise à jour remboursement.",
      "refund_update",
      "refund_update",
      email,
    );
  }
  return applyPaymentStatusWithEmail(
    orderId,
    "payment_issue",
    reason || "Nouveau justificatif demandé par l'admin.",
    "payment_issue",
    "new_proof_requested",
    email,
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
