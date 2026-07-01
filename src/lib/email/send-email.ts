import "server-only";

import { Prisma } from "@prisma/client";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { getStoreSettings } from "@/lib/db/catalog";
import {
  type EmailTemplateKey,
  type RenderedEmailTemplate,
  renderEmailTemplate,
  textToHtml,
} from "@/lib/emailTemplates";
import {
  getFromHeader,
  getReplyToAddress,
  getResendApiKey,
  realEmailsEnabled,
} from "@/lib/email/config";

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

function metadataToJson(metadata?: EmailMetadata): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}

export async function renderTransactionalEmail(
  templateKey: EmailTemplateKey,
  variables: EmailMetadata = {},
  overrides: Partial<Pick<RenderedEmailTemplate, "subject" | "html" | "text">> = {},
): Promise<RenderedEmailTemplate> {
  const settings = await getStoreSettings();
  const rendered = renderEmailTemplate(settings, templateKey, variables);
  const text = overrides.text ?? rendered.text;
  return {
    subject: overrides.subject ?? rendered.subject,
    text,
    html: overrides.html ?? textToHtml(text),
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
      status: realEmailsEnabled() ? "pending" : "simulated",
      manuallyEdited: Boolean(input.manuallyEdited),
      metadata: metadataToJson(input.metadata),
    },
  });

  if (!realEmailsEnabled()) {
    return { ok: true, status: "simulated", logId: log.id };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    const error = "RESEND_API_KEY is not configured.";
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "failed", errorMessage: error },
    });
    return { ok: false, status: "failed", logId: log.id, error };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromHeader(),
        to: [input.to],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(getReplyToAddress() ? { reply_to: getReplyToAddress() } : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
      name?: string;
    };

    if (!response.ok || !payload.id) {
      const error = payload.message || payload.error || `Resend returned ${response.status}.`;
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
        providerMessageId: payload.id,
        errorMessage: null,
      },
    });
    return {
      ok: true,
      status: "sent",
      logId: log.id,
      providerMessageId: payload.id,
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
