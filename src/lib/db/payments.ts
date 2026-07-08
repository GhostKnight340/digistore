import "server-only";

import { ensureDatabaseReady, prisma } from "./prisma";
import { timeAdmin } from "./adminTiming";
import { type EmailTemplateKey } from "@/lib/emailTemplates";
import {
  renderTransactionalEmail,
  sendTransactionalEmail,
} from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { publicOrderReference } from "@/lib/db/orders";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";
import {
  notifyPaymentStatusChange,
  notifyFulfillmentNeeded,
} from "@/lib/discord/notify";
import { attemptAutomaticReloadlyFulfillment } from "@/lib/db/fulfillment";
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

  const { methods } = await getAdminPaymentMethods();
  const method = resolveOrderPaymentMethod(order.paymentMethod, methods);
  const proofRequired =
    method?.proofRequired ?? !["paypal", "card", "test"].includes(order.paymentMethod);
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

    });

    const reference = await publicOrderReference(order);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey: "proof_received",
        type: "payment_submitted",
        variables: {
          customer_name: order.customerName,
          order_number: reference.number,
          order_url: absoluteAppUrl(`/order/${reference.pathSegment}`),
          payment_url: absoluteAppUrl(`/payment/${reference.pathSegment}`),
          total: `${order.totalMad} MAD`,
        },
      });
    } catch (emailError) {
      console.error("[email:proof_received]", emailError);
    }

    void notifyPaymentStatusChange({
      orderId,
      publicOrderNumber: reference.number,
      fromStatus: "pending_payment",
      toStatus: "payment_submitted",
      adminUrl: absoluteAppUrl(`/admin/orders/${orderId}`),
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
  const templateKey: EmailTemplateKey =
    emailType === "payment_confirmed"
      ? "payment_confirmed"
      : emailType === "payment_rejected"
        ? "payment_rejected"
        : "new_proof_requested";

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
    });
    try {
      const preview = await renderPaymentStatusEmailPreview(orderId, templateKey, note);
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey,
        type: emailType,
        subject: preview.subject || subject,
        text: preview.text || body,
        html: preview.html,
        variables: preview.variables,
      });
    } catch (emailError) {
      console.error(`[email:${emailType}]`, emailError);
    }

    const reference = await publicOrderReference(order);
    const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
    void notifyPaymentStatusChange({
      orderId,
      publicOrderNumber: reference.number,
      fromStatus: order.status,
      toStatus,
      note,
      adminUrl,
    });
    if (toStatus === "payment_confirmed") {
      void notifyFulfillmentNeeded({
        orderId,
        publicOrderNumber: reference.number,
        itemCount: await prisma.orderItem.count({ where: { orderId } }),
        adminUrl,
      });
      // Never lets a Reloadly failure break payment confirmation — the
      // function itself catches everything and just leaves the item(s)
      // flagged for manual review/retry in admin.
      void attemptAutomaticReloadlyFulfillment(orderId).catch((error) =>
        console.error("[attemptAutomaticReloadlyFulfillment]", error),
      );
    }

    return { ok: true };
  } catch (error) {
    console.error("[setPaymentStatus]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

export async function renderPaymentStatusEmailPreview(
  orderId: string,
  templateKey: EmailTemplateKey,
  reason = "",
) {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Commande introuvable.");
  const reference = await publicOrderReference(order);
  const variables = {
    customer_name: order.customerName,
    order_number: reference.number,
    order_url: absoluteAppUrl(`/order/${reference.pathSegment}`),
    payment_url: absoluteAppUrl(`/payment/${reference.pathSegment}`),
    total: `${order.totalMad} MAD`,
    reason,
  };
  const rendered = await renderTransactionalEmail(templateKey, variables);
  return { ...rendered, variables };
}

export async function applyPaymentStatusWithEmail(
  orderId: string,
  toStatus: string,
  note: string,
  emailType: string,
  templateKey: EmailTemplateKey,
  email: { subject: string; text: string; html?: string },
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
    });

    const reference = await publicOrderReference(order);

    try {
      await sendTransactionalEmail({
        to: order.customerEmail,
        orderId,
        customerId: order.customerId,
        templateKey,
        type: emailType,
        subject: email.subject,
        text: email.text,
        html: email.html,
        manuallyEdited: true,
        variables: {
          customer_name: order.customerName,
          order_number: reference.number,
          order_url: absoluteAppUrl(`/order/${reference.pathSegment}`),
          payment_url: absoluteAppUrl(`/payment/${reference.pathSegment}`),
          total: `${order.totalMad} MAD`,
          reason: note,
        },
      });
    } catch (emailError) {
      console.error(`[email:${emailType}]`, emailError);
    }

    return { ok: true };
  } catch (error) {
    console.error("[applyPaymentStatusWithEmail]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }
}

// ─── PayPal automated payment ──────────────────────────────────────────────
//
// The customer-approval redirect from PayPal is never trusted on its own —
// every status transition here is driven by a server-side capture call or a
// signature-verified webhook (see src/lib/paypal/operations.ts and
// src/app/api/webhooks/paypal/route.ts). All transitions are idempotent so a
// webhook and a browser capture racing (or a webhook replay) can't double-fire
// emails/Discord/fulfillment notifications.

/** Persists the PayPal order id created for a Ghost order, before approval/capture. */
export async function savePaypalOrderCreated(
  orderId: string,
  input: { paypalOrderId: string; amountValue: string; currency: string },
): Promise<ActionResult> {
  await ensureDatabaseReady();
  try {
    const updated = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: "pending_payment",
        OR: [{ paymentProviderOrderId: null }, { paymentProviderOrderId: input.paypalOrderId }],
      },
      data: {
        paymentProvider: "paypal",
        paymentProviderOrderId: input.paypalOrderId,
        paymentProviderStatus: "CREATED",
        paymentProviderRawStatus: "CREATED",
        paymentProviderAmount: Number(input.amountValue),
        paymentProviderCurrency: input.currency,
      },
    });
    if (updated.count !== 1) {
      return { ok: false, error: "Impossible d'enregistrer la commande PayPal." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[savePaypalOrderCreated]", error);
    return { ok: false, error: "Impossible d'enregistrer la commande PayPal." };
  }
}

async function transitionPaypalStatus(
  orderId: string,
  opts: {
    fromStatuses: string[];
    toStatus: string;
    providerStatus: string;
    rawStatus: string;
    captureId?: string;
    amountValue?: string;
    currency?: string;
    note: string;
    emailType: string;
    templateKey: EmailTemplateKey;
    subject: string;
    body: string;
    triggerFulfillment?: boolean;
  },
): Promise<ActionResult> {
  await ensureDatabaseReady();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Commande introuvable." };

  // Already applied by a previous (possibly concurrent) call — treat as success.
  if (
    order.status === opts.toStatus &&
    (!opts.captureId || order.paymentProviderCaptureId === opts.captureId)
  ) {
    return { ok: true };
  }

  const fromStatus = order.status;
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: opts.fromStatuses } },
        data: {
          status: opts.toStatus,
          paymentProvider: "paypal",
          paymentProviderStatus: opts.providerStatus,
          paymentProviderRawStatus: opts.rawStatus,
          ...(opts.captureId ? { paymentProviderCaptureId: opts.captureId } : {}),
          ...(opts.amountValue ? { paymentProviderAmount: Number(opts.amountValue) } : {}),
          ...(opts.currency ? { paymentProviderCurrency: opts.currency } : {}),
          ...(opts.toStatus === "payment_confirmed" ? { paymentConfirmedAt: new Date() } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("PAYPAL_STATUS_CONFLICT");
      }
      await tx.paymentEvent.create({
        data: { orderId, type: "status_change", fromStatus, toStatus: opts.toStatus, note: opts.note },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYPAL_STATUS_CONFLICT") {
      // Another concurrent call (webhook vs. browser capture) may have
      // already applied this exact transition — treat that as success.
      const latest = await prisma.order.findUnique({ where: { id: orderId } });
      if (
        latest &&
        latest.status === opts.toStatus &&
        (!opts.captureId || latest.paymentProviderCaptureId === opts.captureId)
      ) {
        return { ok: true };
      }
      return { ok: false, error: "Le statut de la commande a changé entre-temps." };
    }
    console.error("[transitionPaypalStatus]", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Mise à jour impossible.",
    };
  }

  try {
    const preview = await renderPaymentStatusEmailPreview(orderId, opts.templateKey, opts.note);
    await sendTransactionalEmail({
      to: order.customerEmail,
      orderId,
      customerId: order.customerId,
      templateKey: opts.templateKey,
      type: opts.emailType,
      subject: preview.subject || opts.subject,
      text: preview.text || opts.body,
      html: preview.html,
      variables: preview.variables,
    });
  } catch (emailError) {
    console.error(`[email:${opts.emailType}]`, emailError);
  }

  const reference = await publicOrderReference(order);
  const adminUrl = absoluteAppUrl(`/admin/orders/${orderId}`);
  void notifyPaymentStatusChange({
    orderId,
    publicOrderNumber: reference.number,
    fromStatus,
    toStatus: opts.toStatus,
    note: opts.note,
    adminUrl,
  });

  if (opts.triggerFulfillment) {
    void notifyFulfillmentNeeded({
      orderId,
      publicOrderNumber: reference.number,
      itemCount: await prisma.orderItem.count({ where: { orderId } }),
      adminUrl,
    });
    void attemptAutomaticReloadlyFulfillment(orderId).catch((error) =>
      console.error("[attemptAutomaticReloadlyFulfillment]", error),
    );
  }

  return { ok: true };
}

/** Marks a Ghost order paid after a trusted, server-verified PayPal capture. */
export async function confirmPaypalPayment(
  orderId: string,
  input: { captureId: string; rawStatus: string; amountValue: string; currency: string },
): Promise<ActionResult> {
  return transitionPaypalStatus(orderId, {
    fromStatuses: ["pending_payment", "payment_submitted"],
    toStatus: "payment_confirmed",
    providerStatus: "COMPLETED",
    rawStatus: input.rawStatus,
    captureId: input.captureId,
    amountValue: input.amountValue,
    currency: input.currency,
    note: `Paiement PayPal capturé (capture ${input.captureId}).`,
    emailType: "payment_confirmed",
    templateKey: "payment_confirmed",
    subject: "Paiement confirmé",
    body: "Votre paiement PayPal a été confirmé. Votre produit numérique sera disponible sous peu.",
    triggerFulfillment: true,
  });
}

/** A PayPal capture came back denied/failed — flag for review, never auto-reject. */
export async function markPaypalCaptureDenied(orderId: string, rawStatus: string): Promise<ActionResult> {
  return transitionPaypalStatus(orderId, {
    fromStatuses: ["pending_payment", "payment_submitted"],
    toStatus: "payment_issue",
    providerStatus: "DENIED",
    rawStatus,
    note: "Paiement PayPal refusé par PayPal.",
    emailType: "payment_issue",
    templateKey: "new_proof_requested",
    subject: "Problème avec votre paiement",
    body: "Votre paiement PayPal n'a pas pu être capturé. Contactez notre support WhatsApp.",
  });
}

/** A completed PayPal capture was refunded or reversed after the fact. */
export async function markPaypalRefunded(orderId: string, rawStatus: string): Promise<ActionResult> {
  return transitionPaypalStatus(orderId, {
    fromStatuses: ["payment_confirmed", "delivered"],
    toStatus: "refunded",
    providerStatus: rawStatus,
    rawStatus,
    note: "Paiement PayPal remboursé/annulé.",
    emailType: "refund_update",
    templateKey: "refund_update",
    subject: "Mise à jour de remboursement",
    body: "Votre paiement PayPal a été remboursé.",
  });
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
