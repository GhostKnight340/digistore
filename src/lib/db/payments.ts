import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import type { ActionResult, AdminPaymentProofDTO } from "@/lib/dto";

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
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.status !== "pending_payment") {
    return { ok: false, error: "La commande n’est pas en attente de paiement." };
  }

  const methodConfig = await prisma.paymentMethodConfig.findUnique({
    where: { method: order.paymentMethod },
    select: { proofRequired: true },
  });
  const proofRequired =
    methodConfig?.proofRequired ?? !["paypal", "card", "test"].includes(order.paymentMethod);
  if (proofRequired && !proof) {
    return { ok: false, error: "Un justificatif de paiement est requis pour ce mode de paiement." };
  }

  if (proof) {
    if (!ALLOWED_PROOF_TYPES.includes(proof.mimeType)) {
      return {
        ok: false,
        error: "Type de fichier non autorisé. Utilisez PNG, JPG, JPEG ou PDF.",
      };
    }
    if (proof.dataBase64.length > 7 * 1024 * 1024) {
      return { ok: false, error: "Fichier trop volumineux. Maximum 5 Mo." };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "pending_payment" },
        data: { status: "payment_submitted" },
      });
      if (updated.count !== 1) {
        throw new Error("Le paiement a déjà été soumis ou le statut de la commande a changé.");
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
          note: proof ? `Justificatif importé : ${proof.fileName}` : "Aucun justificatif importé.",
        },
      });

      await tx.emailLog.create({
        data: {
          orderId,
          type: "payment_submitted",
          recipient: order.customerEmail,
          subject: "Paiement soumis - vérification en cours",
          body: "Nous avons bien reçu votre paiement et le vérifions. Vous serez informé sous peu.",
        },
      });
    });

    return { ok: true };
  } catch (error) {
    console.error("[submitPayment]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Soumission impossible.",
    };
  }
}

export async function approvePayment(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "payment_confirmed",
    "Paiement approuvé par l’admin.",
    "payment_confirmed",
    "Paiement confirmé",
    "Votre paiement a été confirmé. Votre produit numérique sera disponible sous peu.",
  );
}

export async function rejectPayment(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "rejected",
    "Paiement refusé par l’admin.",
    "payment_rejected",
    "Paiement refusé",
    "Nous n’avons pas pu confirmer votre paiement. Contactez-nous sur WhatsApp avec votre numéro de commande.",
  );
}

export async function markPaymentIssue(orderId: string): Promise<ActionResult> {
  return setPaymentStatus(
    orderId,
    "payment_issue",
    "Problème de paiement signalé par l’admin.",
    "payment_issue",
    "Problème avec votre paiement",
    "Un problème a été détecté avec votre paiement. Contactez notre support WhatsApp.",
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
  if (!order) return { ok: false, error: "Commande introuvable." };

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
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

export async function getPaymentProof(
  orderId: string,
): Promise<AdminPaymentProofDTO | null> {
  await ensureDatabaseReady();
  const proof = await timeAdmin(
    "admin.paymentProof",
    "paymentProof.findUnique",
    () => prisma.paymentProof.findUnique({ where: { orderId } }),
    (row) => (row ? 1 : 0),
  );
  if (!proof) return null;
  const source = /^https?:\/\//i.test(proof.data) || proof.data.startsWith("data:")
    ? "url"
    : "base64";
  const sizeBytes =
    source === "base64"
      ? Math.floor((proof.data.length * 3) / 4) - (proof.data.endsWith("==") ? 2 : proof.data.endsWith("=") ? 1 : 0)
      : null;
  return {
    data: proof.data,
    mimeType: proof.mimeType,
    fileName: proof.fileName,
    uploadedAt: proof.uploadedAt.toISOString(),
    sizeBytes,
    source,
  };
}
