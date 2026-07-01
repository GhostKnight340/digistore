import type { StoreSettings } from "./storeSettings";
import {
  getEmailBaseUrl,
  renderEmailLayout,
  renderParagraphs,
  toAbsoluteUrl,
} from "./email/layout";

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

/** Legacy plain wrapper, kept for callers that only need bare paragraphs. */
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

// Per-template presentation: which variable drives the CTA button and whether
// to render an order-summary panel. Everything falls back to the branded base
// layout even when a template has no CTA.
type TemplateMeta = {
  cta?: { label: string; urlVar: string };
  supportCta?: boolean;
  siteCta?: { label: string };
  orderSummary?: boolean;
};

const TEMPLATE_META: Record<EmailTemplateKey, TemplateMeta> = {
  welcome: { siteCta: { label: "Explorer ghost.ma" } },
  email_confirmation: { cta: { label: "Confirmer mon e-mail", urlVar: "confirmation_url" } },
  password_reset: { cta: { label: "Réinitialiser mon mot de passe", urlVar: "reset_url" } },
  order_received: { cta: { label: "Finaliser le paiement", urlVar: "payment_url" }, orderSummary: true },
  awaiting_payment: { cta: { label: "Payer maintenant", urlVar: "payment_url" }, orderSummary: true },
  proof_received: { cta: { label: "Suivre ma commande", urlVar: "order_url" }, orderSummary: true },
  new_proof_requested: { cta: { label: "Envoyer un nouveau justificatif", urlVar: "payment_url" }, orderSummary: true },
  payment_rejected: { supportCta: true, orderSummary: true },
  payment_confirmed: { cta: { label: "Voir ma commande", urlVar: "order_url" }, orderSummary: true },
  order_delivered: { cta: { label: "Accéder à mes codes", urlVar: "delivery_url" }, orderSummary: true },
  refund_update: { supportCta: true, orderSummary: true },
};

function str(value: Variables[string]): string {
  return value == null ? "" : String(value);
}

function whatsappLink(number: string): string {
  const digits = number.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function buildBaseVariables(settings: StoreSettings, variables: Variables): Variables {
  const base: Variables = {
    support_email: process.env.SUPPORT_EMAIL || settings.footer.contactEmail,
    support_whatsapp: settings.footer.whatsappNumber,
    current_year: new Date().getFullYear(),
    ...variables,
  };
  // Absolutize any *_url variable so email links are never relative.
  for (const [key, value] of Object.entries(base)) {
    if (key.endsWith("_url") && typeof value === "string" && value) {
      base[key] = toAbsoluteUrl(value);
    }
  }
  return base;
}

function resolveCta(
  key: EmailTemplateKey,
  base: Variables,
): { label: string; url: string } | null {
  const meta = TEMPLATE_META[key] ?? {};
  if (meta.cta) {
    const url = str(base[meta.cta.urlVar]);
    if (url) return { label: meta.cta.label, url };
  }
  if (meta.siteCta) {
    return { label: meta.siteCta.label, url: getEmailBaseUrl() };
  }
  if (meta.supportCta) {
    const wa = whatsappLink(str(base.support_whatsapp));
    if (wa) return { label: "Contacter le support", url: wa };
    const email = str(base.support_email);
    if (email) return { label: "Contacter le support", url: `mailto:${email}` };
  }
  return null;
}

/**
 * Wrap already-rendered subject + body text (placeholders resolved) in the
 * branded ghost.ma layout. Used both for saved templates and for admin-edited
 * one-off sends so every email is branded.
 */
export function renderBrandedHtml(
  settings: StoreSettings,
  key: EmailTemplateKey,
  subject: string,
  bodyText: string,
  variables: Variables = {},
): string {
  const base = buildBaseVariables(settings, variables);
  const meta = TEMPLATE_META[key] ?? {};
  const orderSummary = meta.orderSummary
    ? [
        { label: "Commande", value: str(base.order_number) },
        { label: "Total", value: str(base.total) },
      ].filter((row) => row.value)
    : null;

  return renderEmailLayout({
    siteName: settings.branding.logoText || "ghost.ma",
    title: subject,
    bodyHtml: renderParagraphs(bodyText),
    cta: resolveCta(key, base),
    orderSummary,
    supportEmail: str(base.support_email),
    supportWhatsapp: str(base.support_whatsapp),
    year: str(base.current_year),
    previewText: bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0] ?? subject,
  });
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
  const base = buildBaseVariables(settings, variables);
  const render = (value: string) =>
    value.replace(/\{\{([a-z_]+)\}\}/g, (_, name: string) => str(base[name]));

  const subject = render(template.subject);
  const text = render(template.body);

  return {
    subject,
    text,
    html: renderBrandedHtml(settings, key, subject, text, variables),
  };
}
