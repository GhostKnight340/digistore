"use server";

import {
  submitPayment,
  approvePayment,
  rejectPayment,
  markPaymentIssue,
  getPaymentProof,
} from "@/lib/db/payments";
import { getPaymentConfig, getAdminPaymentConfig } from "@/lib/db/paymentSettings";
import { getCustomerOrder } from "@/lib/db/orders";
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
    getPaymentConfig(),
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
      return { ok: false, error: "Format non supporte. Utilisez PNG, JPG, JPEG ou PDF." };
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

// ─── Admin payment review actions ─────────────────────────────────────────────

export async function approvePaymentAction(orderId: string): Promise<ActionResult> {
  return approvePayment(orderId);
}

export async function rejectPaymentAction(orderId: string): Promise<ActionResult> {
  return rejectPayment(orderId);
}

export async function markPaymentIssueAction(orderId: string): Promise<ActionResult> {
  return markPaymentIssue(orderId);
}

/** Admin: fetch base64 proof for a given order. */
export async function getPaymentProofAction(
  orderId: string,
): Promise<AdminPaymentProofDTO | null> {
  return getPaymentProof(orderId);
}

// ─── Payment settings actions ──────────────────────────────────────────────────

export async function getAdminPaymentConfigAction() {
  return getAdminPaymentConfig();
}

export { getPaymentConfig as getPaymentConfigAction };
