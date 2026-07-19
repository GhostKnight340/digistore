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
import { getPublicPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveFooterPaymentBadges } from "@/lib/footerConfig";
import { notifyEmailFailure } from "@/lib/discord/notify";
import { isProductionRuntime } from "@/lib/env";

type EmailMetadata = Record<string, string | number | boolean | null | undefined>;

type SendEmailInput = {
  to: string;
  templateKey: EmailTemplateKey;
  orderId?: string | null;
  customerId?: string | null;
  variables?: EmailMetadata;
  subject?: string;
  /**
   * Editable message body. When provided, BOTH the HTML shell body and the
   * plain-text are rendered from it (single source of truth) — do not also pass
   * `html`/`text` for the same email.
   */
  body?: string;
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
  "checkout_email_verification",
  "welcome",
  "password_reset",
  "password_changed",
]);

// Internal Discord onboarding placeholder addresses (see lib/auth.ts). Kept in
// sync locally rather than imported, to avoid a circular auth <-> email import.
// Placeholder addresses are non-deliverable and must never receive mail.
const PLACEHOLDER_EMAIL_DOMAIN = "users.noreply.ghost.ma";

function isPlaceholderRecipient(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

function fromAddress() {
  const name = process.env.EMAIL_FROM_NAME || "ghost.ma";
  const address = process.env.EMAIL_FROM_ADDRESS || "no-reply@ghost.ma";
  return `${name} <${address}>`;
}

/**
 * Recipients allowed to receive REAL email off-production. Comma-separated in
 * `EMAIL_TEST_ALLOWLIST`. Empty ⇒ nobody (all sends are simulated). Lets a tester
 * receive staging mail at their own address without ever mailing real customers.
 */
function recipientIsAllowlisted(to: string): boolean {
  const raw = process.env.EMAIL_TEST_ALLOWLIST;
  if (!raw) return false;
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(to.trim().toLowerCase());
}

/**
 * Gate on the REAL production deployment (VERCEL_ENV="production"), NOT NODE_ENV
 * — Vercel sets NODE_ENV="production" on staging/preview too, so the old check
 * let staging mail real customers. Off-production we only send to an explicit
 * `EMAIL_TEST_ALLOWLIST` (and only when ENABLE_REAL_EMAILS opts in); everything
 * else is simulated + logged. See src/lib/env.ts.
 */
function shouldSendRealEmail(to: string): boolean {
  if (isProductionRuntime()) return true;
  if (process.env.ENABLE_REAL_EMAILS !== "true") return false;
  return recipientIsAllowlisted(to);
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
  overrides: Partial<Pick<RenderedEmailTemplate, "subject" | "html" | "text">> & {
    body?: string;
  } = {},
): Promise<RenderedEmailTemplate> {
  const settings = await getStoreSettings();
  // When a subject/body override is supplied (e.g. the admin review editor),
  // feed it through renderEmailTemplate so the HTML shell body AND the
  // plain-text derive from the SAME source and stay in sync with the preview.
  const templateOverride =
    overrides.subject !== undefined || overrides.body !== undefined
      ? {
          subject:
            overrides.subject ?? settings.emailTemplates[templateKey]?.subject ?? templateKey,
          body: overrides.body ?? settings.emailTemplates[templateKey]?.body ?? "",
        }
      : undefined;
  // Footer badges resolved against the live payment-method registry so
  // e-mails always match the site footer (renames/deactivations propagate).
  const paymentBadges = resolveFooterPaymentBadges(
    settings,
    (await getPublicPaymentMethods()).methods,
  );
  const rendered = renderEmailTemplate(
    settings,
    templateKey,
    variables,
    templateOverride,
    paymentBadges,
  );
  const text = overrides.text ?? rendered.text;
  const overrideHtml = overrides.html?.trim();
  const html =
    overrideHtml && isBrandedHtml(overrideHtml) && !AUTH_TEMPLATE_KEYS.has(templateKey)
      ? overrideHtml
      : rendered.html;
  if (AUTH_TEMPLATE_KEYS.has(templateKey) && !isBrandedHtml(html)) {
    throw new Error(`Auth email template ${templateKey} did not render branded HTML.`);
  }
  return {
    // rendered.subject already interpolates the (possibly overridden) subject.
    subject: rendered.subject,
    text,
    html,
  };
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<EmailSendResult> {
  await ensureDatabaseReady();

  // Never send to an internal Discord onboarding placeholder address. Record a
  // skipped log for audit and return a non-error result so callers (order
  // emails, verification, etc.) proceed unaffected.
  if (isPlaceholderRecipient(input.to)) {
    const log = await prisma.emailLog.create({
      data: {
        orderId: input.orderId ?? null,
        customerId: input.customerId ?? null,
        type: input.type ?? input.templateKey,
        templateKey: input.templateKey,
        recipient: input.to,
        subject: "",
        body: "",
        text: "",
        html: "",
        provider: "resend",
        status: "simulated",
        errorMessage: "Skipped: internal placeholder recipient.",
        metadata: metadataToJson(input.metadata),
      },
    });
    return { ok: true, status: "simulated", logId: log.id };
  }

  const rendered = await renderTransactionalEmail(input.templateKey, input.variables, {
    subject: input.subject,
    body: input.body,
    html: input.html,
    text: input.text,
  });
  const settings = await getStoreSettings();
  const replyTo = process.env.SUPPORT_EMAIL || settings.footer.contactEmail;

  // Auth e-mails carry live secrets in their rendered body — the 6-digit
  // checkout code, the ?token= reset URL. Keep the log row (delivery status,
  // audit, rate-limit forensics all depend on it) but never persist the
  // secret-bearing content: a leaked EmailLog must not be a login.
  const secretBearing = AUTH_TEMPLATE_KEYS.has(input.templateKey);

  const log = await prisma.emailLog.create({
    data: {
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      type: input.type ?? input.templateKey,
      templateKey: input.templateKey,
      recipient: input.to,
      subject: rendered.subject,
      body: secretBearing ? "" : rendered.text,
      text: secretBearing ? "" : rendered.text,
      html: secretBearing ? "" : rendered.html,
      provider: "resend",
      status: shouldSendRealEmail(input.to) ? "pending" : "simulated",
      manuallyEdited: Boolean(input.manuallyEdited),
      metadata: metadataToJson(input.metadata),
    },
  });

  if (!shouldSendRealEmail(input.to)) {
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
