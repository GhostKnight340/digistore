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

type Variables = Record<string, string | number | null | undefined>;

export function renderEmailTemplate(
  settings: StoreSettings,
  key: EmailTemplateKey,
  variables: Variables,
) {
  const template = settings.emailTemplates[key];
  const baseVariables: Variables = {
    support_email: settings.footer.contactEmail,
    support_whatsapp: settings.footer.whatsappNumber,
    ...variables,
  };
  const render = (value: string) =>
    value.replace(/\{\{([a-z_]+)\}\}/g, (_, name: string) =>
      String(baseVariables[name] ?? ""),
    );

  return {
    subject: render(template.subject),
    body: render(template.body),
  };
}
