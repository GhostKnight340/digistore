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
import type { ActionResult, PaymentConfigDTO, CustomerOrderDTO } from "@/lib/dto";

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
    const buffer = Buffer.from(await file.arrayBuffer());
    proof = {
      fileName: file.name,
      mimeType: file.type,
      dataBase64: buffer.toString("base64"),
    };
  }

  return submitPayment(orderId, proof);
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
): Promise<{ data: string; mimeType: string; fileName: string; uploadedAt: string } | null> {
  return getPaymentProof(orderId);
}

// ─── Payment settings actions ──────────────────────────────────────────────────

export async function getAdminPaymentConfigAction() {
  return getAdminPaymentConfig();
}

export { getPaymentConfig as getPaymentConfigAction };
