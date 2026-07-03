import type { StoreSettings } from "./storeSettings";
import { absoluteAppUrl } from "./orderNumber";
import { emailIconUrl, getEnabledFooterPaymentBadges, getFooterSocialLinks, whatsappUrl } from "./footerConfig";

export type EmailTemplateKey =
  | "welcome"
  | "email_verification"
  | "email_confirmation"
  | "password_reset"
  | "password_changed"
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

function variableString(variables: Variables, key: string) {
  return String(variables[key] ?? "");
}

function emailLogoUrl() {
  return absoluteAppUrl("/ghost-logo.png");
}

function brandedButton(label: string, href: string) {
  if (!href) return "";
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px auto 6px;">
      <tr>
        <td style="border-radius: 12px; background: #3e7bfa;">
          <a href="${safeHref}" style="display: inline-block; padding: 14px 22px; color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Per-template call-to-action mapping. The BODY of the email always comes from
 * the editable template body (single source of truth); only the button label
 * and which variable supplies its URL are mapped here so the button text
 * matches the template's purpose.
 */
const CTA_BY_TEMPLATE: Partial<Record<EmailTemplateKey, { label: string; urlKeys: string[] }>> = {
  welcome: { label: "Ouvrir mon compte", urlKeys: ["account_url"] },
  email_verification: { label: "Vérifier mon e-mail", urlKeys: ["verification_url"] },
  email_confirmation: { label: "Ouvrir mon compte", urlKeys: ["account_url"] },
  password_reset: { label: "Réinitialiser mon mot de passe", urlKeys: ["reset_password_url"] },
  password_changed: { label: "Sécuriser mon compte", urlKeys: ["account_url"] },
  order_received: { label: "Finaliser le paiement", urlKeys: ["payment_url", "order_url"] },
  awaiting_payment: { label: "Finaliser le paiement", urlKeys: ["payment_url", "order_url"] },
  proof_received: { label: "Suivre ma commande", urlKeys: ["order_url", "payment_url"] },
  new_proof_requested: { label: "Ajouter un justificatif", urlKeys: ["payment_url", "order_url"] },
  payment_rejected: { label: "Voir le paiement", urlKeys: ["payment_url", "order_url"] },
  payment_confirmed: { label: "Suivre ma commande", urlKeys: ["order_url"] },
  order_delivered: { label: "Voir ma livraison", urlKeys: ["delivery_url", "order_url"] },
  refund_update: { label: "Suivre ma commande", urlKeys: ["order_url"] },
};

function ctaFor(key: EmailTemplateKey, variables: Variables): { label: string; url: string } | null {
  const cta = CTA_BY_TEMPLATE[key];
  if (!cta) return null;
  const url = cta.urlKeys.map((urlKey) => variableString(variables, urlKey)).find(Boolean) ?? "";
  if (!url) return null;
  return { label: cta.label, url };
}

/**
 * Converts the (already variable-substituted) template body into HTML,
 * preserving exactly what the editor contains: blank lines become separate
 * paragraphs and single newlines become <br>. No greeting, intro, or any other
 * copy is injected — the body is rendered verbatim.
 */
function bodyToHtml(body: string) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks
    .map((block) => {
      const lines = block.split(/\n/).map((line) => escapeHtml(line));
      return `<p style="margin: 0 0 16px; color: #d3dbef; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7;">${lines.join(
        "<br />",
      )}</p>`;
    })
    .join("\n");
}

function emailFooterHtml(settings: StoreSettings, supportEmail: string, currentYear: string) {
  const socialLinks = getFooterSocialLinks(settings);
  const paymentBadges = getEnabledFooterPaymentBadges(settings);
  const supportWhatsappUrl = whatsappUrl(settings.footer.whatsappNumber);

  const socialHtml = socialLinks.length
    ? `<tr>
        <td align="center" style="padding: 16px 0 0;">
          ${socialLinks
            .map(
              (link) =>
                `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(
                  link.ariaLabel,
                )}" style="display: inline-block; width: 34px; height: 34px; margin: 0 4px; border: 1px solid #2f3954; border-radius: 999px; background: #151a25; text-decoration: none;">
                  <img src="${escapeHtml(emailIconUrl(link.iconPath))}" width="16" height="16" alt="${escapeHtml(
                    link.label,
                  )}" style="display: block; width: 16px; height: 16px; margin: 9px auto; border: 0;" />
                </a>`,
            )
            .join("")}
        </td>
      </tr>`
    : "";

  const paymentHtml = paymentBadges.length
    ? `<tr>
        <td align="center" style="padding: 16px 0 0;">
          ${paymentBadges
            .map(
              (badge) =>
                `<span style="display: inline-block; margin: 0 4px 8px; border: 1px solid #2f3954; border-radius: 8px; padding: 6px 9px; color: #aab4c8; font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; letter-spacing: .02em;">${escapeHtml(
                  badge.label,
                )}</span>`,
            )
            .join("")}
        </td>
      </tr>`
    : "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding: 22px 8px 0; color: #7f899c; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.7; text-align: center;">
          Besoin d’aide ? Contactez-nous à
          <a href="mailto:${escapeHtml(supportEmail)}" style="color: #9fb4ff;">${escapeHtml(supportEmail)}</a>
          ${
            supportWhatsappUrl
              ? `ou <a href="${escapeHtml(
                  supportWhatsappUrl,
                )}" target="_blank" rel="noopener noreferrer" style="color: #9fb4ff;">WhatsApp</a>`
              : ""
          }.
        </td>
      </tr>
      ${socialHtml}
      ${paymentHtml}
      <tr>
        <td align="center" style="padding: 8px 8px 0; color: #69758b; font-family: Arial, sans-serif; font-size: 12px;">
          © ${escapeHtml(currentYear)} ghost.ma
        </td>
      </tr>
    </table>`;
}

/**
 * Wraps the email in the shared branded shell (background, logo header, footer
 * with support links / social icons / payment badges). The visible content is
 * strictly: the subject as the heading, the template body verbatim, and the
 * per-template CTA button. Nothing else is injected.
 */
function brandedEmailHtml(
  key: EmailTemplateKey,
  subject: string,
  body: string,
  variables: Variables,
  settings: StoreSettings,
) {
  const supportEmail = variableString(variables, "support_email") || "support@ghost.ma";
  const currentYear = variableString(variables, "current_year") || String(new Date().getFullYear());
  const logoUrl = emailLogoUrl();
  const cta = ctaFor(key, variables);
  // Hidden inbox preview text. Use the subject so it never duplicates the
  // visible body's opening line.
  const preheader = subject;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #080a0f; color: #f6f7fb;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #080a0f; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px;">
            <tr>
              <td style="padding: 0 0 18px;">
                <a href="${escapeHtml(absoluteAppUrl("/"))}" style="display: inline-block; text-decoration: none; border: 0;">
                  <img src="${escapeHtml(logoUrl)}" width="181" height="36" alt="ghost.ma" style="display: block; width: 181px; height: 36px; border: 0;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #232838; border-radius: 18px; background: #11141d; padding: 34px 30px; box-shadow: 0 24px 70px rgba(0,0,0,0.28);">
                <h1 style="margin: 0 0 20px; color: #ffffff; font-family: Arial, sans-serif; font-size: 26px; line-height: 1.25;">
                  ${escapeHtml(subject)}
                </h1>
                ${bodyToHtml(body)}
                ${cta ? brandedButton(cta.label, cta.url) : ""}
              </td>
            </tr>
            <tr>
              <td>
                ${emailFooterHtml(settings, supportEmail, currentYear)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

  // Single source of truth: subject and body come straight from the editable
  // template. The plaintext version IS the rendered body — no separate copy.
  const subject = render(template.subject);
  const body = render(template.body);

  return {
    subject,
    text: body,
    html: brandedEmailHtml(key, subject, body, baseVariables, settings),
  };
}
