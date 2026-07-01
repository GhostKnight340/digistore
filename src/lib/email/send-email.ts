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

type EmailMetadata = Record<string, string | number | boolean | null | undefined>;

type SendEmailInput = {
  to: string;
  templateKey: EmailTemplateKey;
  orderId?: string | null;
  customerId?: string | null;
  variables?: EmailMetadata;
  subject?: string;
  html?: string;
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

const AUTH_TEMPLATE_KEYS = new Set<EmailTemplateKey>([
  "email_verification",
  "welcome",
  "password_reset",
  "password_changed",
]);

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

function isBrandedHtml(html: string) {
  return (
    html.includes("<!DOCTYPE html>") &&
    html.includes("<table") &&
    html.includes("style=") &&
    html.includes("background") &&
    html.includes("border-radius") &&
    !html.trim().startsWith("<p>")
  );
}

export async function renderTransactionalEmail(
  templateKey: EmailTemplateKey,
  variables: EmailMetadata = {},
  overrides: Partial<Pick<RenderedEmailTemplate, "subject" | "html" | "text">> = {},
): Promise<RenderedEmailTemplate> {
  const settings = await getStoreSettings();
  const rendered = renderEmailTemplate(settings, templateKey, variables);
  const text = overrides.text ?? rendered.text;
  const html = AUTH_TEMPLATE_KEYS.has(templateKey)
    ? rendered.html
    : overrides.html ?? rendered.html;
  if (AUTH_TEMPLATE_KEYS.has(templateKey) && !isBrandedHtml(html)) {
    throw new Error(`Auth email template ${templateKey} did not render branded HTML.`);
  }
  return {
    subject: overrides.subject ?? rendered.subject,
    text,
    html,
  };
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<EmailSendResult> {
  await ensureDatabaseReady();
  const rendered = await renderTransactionalEmail(input.templateKey, input.variables, {
    subject: input.subject,
    html: input.html,
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
    return { ok: false, status: "failed", logId: log.id, error };
  }

  try {
    const resend = new Resend(apiKey);
    const from = fromAddress();
    const to = input.to;
    const subject = rendered.subject;
    const html = rendered.html;
    const text = rendered.text;

    console.log(html);

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
    return { ok: false, status: "failed", logId: log.id, error: message };
  }
}
