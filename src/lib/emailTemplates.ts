import type { StoreSettings } from "./storeSettings";

export type EmailTemplateKey =
  | "welcome"
  | "email_confirmation"
  | "password_reset"
  | "order_received"
  | "awaiting_payment"
  | "proof_received"
  | "new_proof_requested"
  | "payment_rejected"
  | "payment_confirmed"
  | "order_delivered"
  | "refund_update";

type Variables = Record<string, string | number | boolean | null | undefined>;

export type RenderedEmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

export function renderEmailTemplate(
  settings: StoreSettings,
  key: EmailTemplateKey,
  variables: Variables,
): RenderedEmailTemplate {
  const template = settings.emailTemplates[key] ?? {
    subject: key,
    body: "",
  };
  const baseVariables: Variables = {
    support_email: process.env.SUPPORT_EMAIL || settings.footer.contactEmail,
    support_whatsapp: settings.footer.whatsappNumber,
    current_year: new Date().getFullYear(),
    ...variables,
  };
  const render = (value: string) =>
    value.replace(/\{\{([a-z_]+)\}\}/g, (_, name: string) =>
      String(baseVariables[name] ?? ""),
    );

  return {
    subject: render(template.subject),
    text: render(template.body),
    html: textToHtml(render(template.body)),
  };
}
