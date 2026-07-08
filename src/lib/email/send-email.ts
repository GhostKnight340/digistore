import "server-only";

import { Prisma } from "@prisma/client";
import { Resend } from "resend";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { getStoreSettings } from "@/lib/db/catalog";
import {
  type EmailTemplateKey,
  type RenderedEmailTemplate,
  renderEmailTemplate,
} from "@/lib/emailTemplates";
import { notifyEmailFailure } from "@/lib/discord/notify";

type EmailMetadata = Record<string, string | number | boolean | null | undefined>;

type SendEmailInput = {
  to: string;
  templateKey: EmailTemplateKey;
  orderId?: string | null;
  customerId?: string | null;
  variables?: EmailMetadata;
  subject?: string;
  text?: string;
  metadata?: EmailMetadata;
  manuallyEdited?: boolean;
  type?: string;
};

type EmailSendResult = {
  ok: boolean;
  status: "sent" | "failed" | "simulated";
  logId: string;
  providerMessageId?: string;
  error?: string;
};

function fromAddress() {
  const name = process.env.EMAIL_FROM_NAME || "ghost.ma";
  const address = process.env.EMAIL_FROM_ADDRESS || "no-reply@ghost.ma";
  return `${name} <${address}>`;
}

function shouldSendRealEmail() {
  return process.env.NODE_ENV === "production" || process.env.ENABLE_REAL_EMAILS === "true";
}

function metadataToJson(metadata?: EmailMetadata): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}

export async function renderTransactionalEmail(
  templateKey: EmailTemplateKey,
  variables: EmailMetadata = {},
  overrides: Partial<Pick<RenderedEmailTemplate, "subject" | "text">> = {},
): Promise<RenderedEmailTemplate> {
  const settings = await getStoreSettings();
  return renderEmailTemplate(settings, templateKey, variables, overrides);
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<EmailSendResult> {
  await ensureDatabaseReady();
  const rendered = await renderTransactionalEmail(input.templateKey, input.variables, {
    subject: input.subject,
    text: input.text,
  });
  const settings = await getStoreSettings();
  const replyTo = process.env.SUPPORT_EMAIL || settings.footer.contactEmail;

  const log = await prisma.emailLog.create({
    data: {
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      type: input.type ?? input.templateKey,
      templateKey: input.templateKey,
      recipient: input.to,
      subject: rendered.subject,
      body: rendered.text,
      text: rendered.text,
      html: rendered.html,
      provider: "resend",
      status: shouldSendRealEmail() ? "pending" : "simulated",
      manuallyEdited: Boolean(input.manuallyEdited),
      metadata: metadataToJson(input.metadata),
    },
  });

  if (!shouldSendRealEmail()) {
    return { ok: true, status: "simulated", logId: log.id };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "RESEND_API_KEY is not configured.";
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "failed", errorMessage: error },
    });
    void notifyEmailFailure({
      templateKey: input.templateKey,
      recipient: input.to,
      error,
      orderId: input.orderId,
    });
    return { ok: false, status: "failed", logId: log.id, error };
  }

  try {
    const resend = new Resend(apiKey);
    const from = fromAddress();
    const to = input.to;
    const subject = rendered.subject;
    const html = rendered.html;
    const text = rendered.text;

    const { data, error: resendError } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      replyTo,
    });

    if (resendError || !data?.id) {
      const error =
        resendError?.message || resendError?.name || "Resend did not return a message id.";
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { status: "failed", errorMessage: error },
      });
      void notifyEmailFailure({
        templateKey: input.templateKey,
        recipient: input.to,
        error,
        orderId: input.orderId,
      });
      return { ok: false, status: "failed", logId: log.id, error };
    }

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: "sent",
        providerMessageId: data.id,
        errorMessage: null,
      },
    });
    return {
      ok: true,
      status: "sent",
      logId: log.id,
      providerMessageId: data.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resend send failed.";
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "failed", errorMessage: message },
    });
    void notifyEmailFailure({
      templateKey: input.templateKey,
      recipient: input.to,
      error: message,
      orderId: input.orderId,
    });
    return { ok: false, status: "failed", logId: log.id, error: message };
  }
}
