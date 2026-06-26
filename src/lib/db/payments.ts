import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
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
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending_payment") {
    return { ok: false, error: "Order is not in pending_payment state." };
  }

  const methodConfig = await prisma.paymentMethodConfig.findUnique({
    where: { method: order.paymentMethod },
    select: { proofRequired: true },
  });
  const proofRequired =
    methodConfig?.proofRequired ?? !["paypal", "card", "test"].includes(order.paymentMethod);
  if (proofRequired && !proof) {
    return { ok: false, error: "Payment proof is required for this method." };
  }

  if (proof) {
    if (!ALLOWED_PROOF_TYPES.includes(proof.mimeType)) {
      return {
        ok: false,
        error: "File type not allowed. Use PNG, JPG, JPEG or PDF.",
      };
    }
    if (proof.dataBase64.length > 7 * 1024 * 1024) {
      return { ok: false, error: "File too large. Maximum 5 MB." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "pending_payment" },
        data: { status: "payment_submitted" },
      });
      if (updated.count !== 1) {
        throw new Error("Payment was already submitted or the order status changed.");
      }

      if (proof) {
        await tx.paymentProof.upsert({
          where: { orderId },
          update: {
            fileName: proof.fileName,
            mimeType: proof.mimeType,
            data: proof.dataBase64,
            uploadedAt: new Date(),
          },
          create: {
            orderId,
            fileName: proof.fileName,
            mimeType: proof.mimeType,
            data: proof.dataBase64,
          },
        });
      }

      await tx.paymentEvent.create({
        data: {
          orderId,
          type: "status_change",
          fromStatus: "pending_payment",
          toStatus: "payment_submitted",
          note: proof ? `Proof uploaded: ${proof.fileName}` : "No proof uploaded.",
        },
      });

      await tx.emailLog.create({
        data: {
          orderId,
          type: "payment_submitted",
          recipient: order.customerEmail,
          subject: "Paiement soumis - verification en cours",
          body: "We received your payment submission and are verifying it. We will notify you shortly.",
        },
      });
    });

    return { ok: true };
  } catch (error) {
    console.error("[submitPayment]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Submit failed.",
    };
  }
}

export async function approvePayment(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "payment_confirmed",
    "Admin approved payment.",
    "payment_confirmed",
    "Paiement confirme",
    "Your payment has been confirmed. Your code will be delivered shortly.",
  );
}

export async function rejectPayment(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "rejected",
    "Admin rejected payment.",
    "payment_rejected",
    "Paiement refuse",
    "We could not confirm your payment. Please contact us on WhatsApp with your order number.",
  );
}

export async function markPaymentIssue(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "payment_issue",
    "Admin flagged a payment issue.",
    "payment_issue",
    "Probleme avec votre paiement",
    "An issue was detected with your payment. Please contact our WhatsApp support.",
  );
}

async function setPaymentStatus(
  orderId: string,
  toStatus: string,
  note: string,
  emailType: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: toStatus } });
      await tx.paymentEvent.create({
        data: {
          orderId,
          type: "status_change",
          fromStatus: order.status,
          toStatus,
          note,
        },
      });
      await tx.emailLog.create({
        data: {
          orderId,
          type: emailType,
          recipient: order.customerEmail,
          subject,
          body,
        },
      });
    });
    return { ok: true };
  } catch (error) {
    console.error("[setPaymentStatus]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed.",
    };
  }
}

export async function getPaymentProof(
  orderId: string,
): Promise<{ data: string; mimeType: string; fileName: string } | null> {
  await ensureDatabaseReady();
  const proof = await timeAdmin(
    "admin.paymentProof",
    "paymentProof.findUnique",
    () => prisma.paymentProof.findUnique({ where: { orderId } }),
    (row) => (row ? 1 : 0),
  );
  if (!proof) return null;
  return {
    data: proof.data,
    mimeType: proof.mimeType,
    fileName: proof.fileName,
  };
}
