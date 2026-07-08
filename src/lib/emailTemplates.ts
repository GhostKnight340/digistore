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
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px auto 18px;">
      <tr>
        <td style="border-radius: 12px; background: #3e7bfa;">
          <a href="${safeHref}" style="display: inline-block; padding: 14px 22px; color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function codeListHtml(codesValue: string) {
  const codes = codesValue
    .split(/\r?\n/)
    .map((code) => code.trim())
    .filter(Boolean);
  if (codes.length === 0) return "";

  const rows = codes
    .map(
      (code, index) => `
        <tr>
          <td style="padding: ${index === 0 ? "0" : "10px"} 0 0;">
            <p style="margin: 0 0 6px; color: #9fb4ff; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;">
              Votre code${codes.length > 1 ? ` ${index + 1}` : ""}
            </p>
            <div style="border: 1px solid #2f3954; border-radius: 12px; background: #0a0d14; padding: 13px 14px; color: #ffffff; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; letter-spacing: .05em; word-break: break-all;">
              ${escapeHtml(code)}
            </div>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 22px 0 0;">
      ${rows}
    </table>`;
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

function brandedEmailHtml(
  key: EmailTemplateKey,
  subject: string,
  text: string,
  variables: Variables,
  settings: StoreSettings,
) {
  const customerName = variableString(variables, "customer_name") || "client";
  const supportEmail = variableString(variables, "support_email") || "support@ghost.ma";
  const currentYear = variableString(variables, "current_year") || String(new Date().getFullYear());
  const verificationUrl = variableString(variables, "verification_url");
  const resetUrl = variableString(variables, "reset_password_url");
  const accountUrl = variableString(variables, "account_url");
  const orderUrl = variableString(variables, "order_url");
  const paymentUrl = variableString(variables, "payment_url");
  const deliveryUrl = variableString(variables, "delivery_url");
  const codes = variableString(variables, "codes");
  const logoUrl = emailLogoUrl();

  const config: Record<
    string,
    {
      title: string;
      intro: string;
      ctaLabel?: string;
      ctaUrl?: string;
      fallbackLabel?: string;
      notice?: string;
    }
  > = {
    email_verification: {
      title: "Vérifiez votre e-mail",
      intro:
        "Confirmez votre adresse e-mail pour sécuriser votre compte ghost.ma et accéder à votre espace client.",
      ctaLabel: "Vérifier mon e-mail",
      ctaUrl: verificationUrl,
      fallbackLabel: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    },
    welcome: {
      title: "Bienvenue sur ghost.ma",
      intro:
        "Votre compte est prêt. Vous pouvez suivre vos commandes et retrouver vos produits numériques depuis votre espace client.",
      ctaLabel: "Ouvrir mon compte",
      ctaUrl: accountUrl,
    },
    password_reset: {
      title: "Réinitialisez votre mot de passe",
      intro:
        "Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte ghost.ma.",
      ctaLabel: "Réinitialiser mon mot de passe",
      ctaUrl: resetUrl,
      fallbackLabel: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
      notice: "Ce lien expire bientôt. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
    },
    password_changed: {
      title: "Votre mot de passe a été modifié",
      intro:
        "Le mot de passe de votre compte ghost.ma vient d’être modifié. Si vous n’êtes pas à l’origine de cette action, contactez immédiatement le support.",
      ctaLabel: "Sécuriser mon compte",
      ctaUrl: accountUrl,
    },
    email_confirmation: {
      title: subject,
      intro: text,
      ctaLabel: "Ouvrir mon compte",
      ctaUrl: accountUrl,
    },
    order_received: {
      title: subject,
      intro: text,
      ctaLabel: "Finaliser le paiement",
      ctaUrl: paymentUrl || orderUrl,
    },
    awaiting_payment: {
      title: subject,
      intro: text,
      ctaLabel: "Finaliser le paiement",
      ctaUrl: paymentUrl,
    },
    proof_received: {
      title: subject,
      intro: text,
      ctaLabel: "Suivre ma commande",
      ctaUrl: orderUrl || paymentUrl,
    },
    new_proof_requested: {
      title: subject,
      intro: text,
      ctaLabel: "Ajouter un justificatif",
      ctaUrl: paymentUrl || orderUrl,
    },
    payment_rejected: {
      title: subject,
      intro: text,
      ctaLabel: "Voir le paiement",
      ctaUrl: paymentUrl || orderUrl,
    },
    payment_confirmed: {
      title: subject,
      intro: text,
      ctaLabel: "Suivre ma commande",
      ctaUrl: orderUrl,
    },
    order_delivered: {
      title: subject,
      intro: `Votre commande ${variableString(
        variables,
        "order_number",
      )} est disponible. Vos codes sont prêts ci-dessous et restent accessibles depuis votre page de livraison.`,
      ctaLabel: "Voir ma livraison",
      ctaUrl: deliveryUrl || orderUrl,
    },
    refund_update: {
      title: subject,
      intro: text,
      ctaLabel: "Suivre ma commande",
      ctaUrl: orderUrl,
    },
  };

  const selected = config[key] ?? {
    title: subject,
    intro: text,
  };
  const fallbackUrl = selected.ctaUrl || "";

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #080a0f; color: #f6f7fb;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      ${escapeHtml(selected.intro)}
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
                <p style="margin: 0 0 12px; color: #9fb4ff; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">
                  Compte client
                </p>
                <h1 style="margin: 0; color: #ffffff; font-family: Arial, sans-serif; font-size: 28px; line-height: 1.2;">
                  ${escapeHtml(selected.title)}
                </h1>
                <p style="margin: 20px 0 0; color: #d9e2ff; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.7;">
                  Bonjour ${escapeHtml(customerName)},
                </p>
                <p style="margin: 10px 0 0; color: #c4cce0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7;">
                  ${escapeHtml(selected.intro)}
                </p>
                ${key === "order_delivered" ? codeListHtml(codes) : ""}
                ${brandedButton(selected.ctaLabel ?? "Ouvrir ghost.ma", selected.ctaUrl ?? "")}
                ${
                  fallbackUrl && selected.fallbackLabel
                    ? `<p style="margin: 16px 0 0; color: #8f9bb3; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;">
                        ${escapeHtml(selected.fallbackLabel)}<br />
                        <a href="${escapeHtml(fallbackUrl)}" style="color: #7ba7ff; word-break: break-all;">${escapeHtml(fallbackUrl)}</a>
                      </p>`
                    : ""
                }
                ${
                  selected.notice
                    ? `<p style="margin: 20px 0 0; border-radius: 12px; background: rgba(62,123,250,0.10); padding: 14px 16px; color: #cbd6ee; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;">
                        ${escapeHtml(selected.notice)}
                      </p>`
                    : ""
                }
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
  templateOverride?: { subject: string; body: string },
): RenderedEmailTemplate {
  const template = templateOverride ?? settings.emailTemplates[key] ?? {
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

  const subject =
    key === "password_changed"
      ? "Votre mot de passe ghost.ma a été modifié"
      : render(template.subject);
  const renderedBody = render(template.body);
  const text =
    key === "password_changed"
      ? [
          `Bonjour ${variableString(baseVariables, "customer_name") || "client"},`,
          "",
          "Le mot de passe de votre compte ghost.ma vient d’être modifié.",
          "",
          "Si vous n’êtes pas à l’origine de cette action, contactez immédiatement le support.",
        ].join("\n")
      : key === "order_delivered"
      ? [
          `Bonjour ${variableString(baseVariables, "customer_name") || "client"},`,
          "",
          `Votre commande ${variableString(baseVariables, "order_number")} est disponible.`,
          "",
          "Vos codes :",
          variableString(baseVariables, "codes"),
          "",
          `Livraison : ${variableString(baseVariables, "delivery_url")}`,
          "",
          "Merci pour votre achat.",
        ].join("\n")
      : renderedBody;
  return {
    subject,
    text,
    html: brandedEmailHtml(key, subject, text, baseVariables, settings),
  };
}

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  welcome: "Bienvenue",
  email_verification: "Vérification d'e-mail",
  email_confirmation: "Confirmation d'e-mail",
  password_reset: "Réinitialisation du mot de passe",
  password_changed: "Mot de passe modifié",
  order_received: "Commande reçue",
  awaiting_payment: "Paiement en attente",
  proof_received: "Justificatif reçu",
  new_proof_requested: "Nouveau justificatif demandé",
  payment_rejected: "Paiement refusé",
  payment_confirmed: "Paiement confirmé",
  order_delivered: "Commande livrée",
  refund_update: "Mise à jour du remboursement",
};

type TemplateVariable = { key: string; sample: string };

export const EMAIL_TEMPLATE_VARIABLES: Record<EmailTemplateKey, TemplateVariable[]> = {
  welcome: [
    { key: "customer_name", sample: "Amine" },
    { key: "account_url", sample: "https://ghost.ma/account" },
  ],
  email_verification: [
    { key: "customer_name", sample: "Amine" },
    { key: "verification_url", sample: "https://ghost.ma/verify/example" },
  ],
  email_confirmation: [
    { key: "customer_name", sample: "Amine" },
    { key: "account_url", sample: "https://ghost.ma/account" },
  ],
  password_reset: [
    { key: "customer_name", sample: "Amine" },
    { key: "reset_password_url", sample: "https://ghost.ma/reset-password/example" },
  ],
  password_changed: [
    { key: "customer_name", sample: "Amine" },
    { key: "account_url", sample: "https://ghost.ma/account" },
  ],
  order_received: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
    { key: "total", sample: "250 MAD" },
  ],
  awaiting_payment: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
    { key: "total", sample: "250 MAD" },
  ],
  proof_received: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
  ],
  new_proof_requested: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "reason", sample: "Justificatif illisible" },
  ],
  payment_rejected: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "reason", sample: "Justificatif illisible" },
  ],
  payment_confirmed: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
  ],
  order_delivered: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "delivery_url", sample: "https://ghost.ma/delivery/example" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "codes", sample: "AAAA-BBBB-CCCC" },
  ],
  refund_update: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "reason", sample: "Remboursement partiel" },
    { key: "total", sample: "250 MAD" },
  ],
};

export function sampleVariablesForKey(key: EmailTemplateKey): Record<string, string> {
  const vars = EMAIL_TEMPLATE_VARIABLES[key] ?? [];
  return Object.fromEntries(vars.map((variable) => [variable.key, variable.sample]));
}
