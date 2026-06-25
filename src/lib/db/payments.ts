import "server-only";

import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/dto";

const ALLOWED_PROOF_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
];

export async function submitPayment(
  orderId: string,
  proof?: { fileName: string; mimeType: string; dataBase64: string },
): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending_payment") {
    return { ok: false, error: "Order is not in pending_payment state." };
  }

  if (proof) {
    if (!ALLOWED_PROOF_TYPES.includes(proof.mimeType)) {
      return { ok: false, error: "File type not allowed. Use PNG, JPG, JPEG or PDF." };
    }
    // 5 MB limit (base64 is ~1.33x the original size)
    if (proof.dataBase64.length > 7 * 1024 * 1024) {
      return { ok: false, error: "File too large. Maximum 5 MB." };
    }
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "payment_submitted" },
    }),
    ...(proof
      ? [
          prisma.paymentProof.upsert({
            where: { orderId },
            update: {
              fileName: proof.fileName,
              mimeType: proof.mimeType,
              data: proof.dataBase64,
            },
            create: {
              orderId,
              fileName: proof.fileName,
              mimeType: proof.mimeType,
              data: proof.dataBase64,
            },
          }),
        ]
      : []),
    prisma.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus: "pending_payment",
        toStatus: "payment_submitted",
        note: proof ? `Proof uploaded: ${proof.fileName}` : "No proof uploaded.",
      },
    }),
    prisma.emailLog.create({
      data: {
        orderId,
        type: "payment_submitted",
        recipient: order.customerEmail,
        subject: "Paiement soumis — vérification en cours",
        body: "We received your payment submission and are verifying it. We will notify you shortly.",
      },
    }),
  ]);

  return { ok: true };
}

export async function approvePayment(orderId: string): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_confirmed" || order.status === "delivered") {
    return { ok: false, error: "Payment already confirmed." };
  }

  const fromStatus = order.status;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "payment_confirmed" },
    }),
    prisma.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus,
        toStatus: "payment_confirmed",
        note: "Admin approved payment.",
      },
    }),
    prisma.emailLog.create({
      data: {
        orderId,
        type: "payment_confirmed",
        recipient: order.customerEmail,
        subject: "Paiement confirmé",
        body: "Your payment has been confirmed. Your code will be delivered shortly.",
      },
    }),
  ]);

  return { ok: true };
}

export async function rejectPayment(orderId: string): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "rejected") return { ok: false, error: "Already rejected." };

  const fromStatus = order.status;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "rejected" },
    }),
    prisma.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus,
        toStatus: "rejected",
        note: "Admin rejected payment.",
      },
    }),
    prisma.emailLog.create({
      data: {
        orderId,
        type: "payment_rejected",
        recipient: order.customerEmail,
        subject: "Paiement refusé",
        body: "We could not confirm your payment. Please contact us on WhatsApp with your order number.",
      },
    }),
  ]);

  return { ok: true };
}

export async function markPaymentIssue(orderId: string): Promise<ActionResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "payment_issue") return { ok: false, error: "Already marked as issue." };

  const fromStatus = order.status;

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: "payment_issue" },
    }),
    prisma.paymentEvent.create({
      data: {
        orderId,
        type: "status_change",
        fromStatus,
        toStatus: "payment_issue",
        note: "Admin flagged a payment issue.",
      },
    }),
    prisma.emailLog.create({
      data: {
        orderId,
        type: "payment_issue",
        recipient: order.customerEmail,
        subject: "Problème avec votre paiement",
        body: "An issue was detected with your payment. Please contact our WhatsApp support.",
      },
    }),
  ]);

  return { ok: true };
}

export async function getPaymentProof(
  orderId: string,
): Promise<{ data: string; mimeType: string; fileName: string } | null> {
  const proof = await prisma.paymentProof.findUnique({ where: { orderId } });
  if (!proof) return null;
  return { data: proof.data, mimeType: proof.mimeType, fileName: proof.fileName };
}
