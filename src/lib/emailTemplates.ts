import type { StoreSettings } from "./storeSettings";

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

function brandedEmailHtml(
  key: EmailTemplateKey,
  subject: string,
  text: string,
  variables: Variables,
) {
  const customerName = variableString(variables, "customer_name") || "client";
  const supportEmail = variableString(variables, "support_email") || "support@ghost.ma";
  const supportWhatsapp = variableString(variables, "support_whatsapp");
  const currentYear = variableString(variables, "current_year") || String(new Date().getFullYear());
  const verificationUrl = variableString(variables, "verification_url");
  const resetUrl = variableString(variables, "reset_password_url");
  const accountUrl = variableString(variables, "account_url");
  const orderUrl = variableString(variables, "order_url");
  const paymentUrl = variableString(variables, "payment_url");
  const deliveryUrl = variableString(variables, "delivery_url");

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
      notice: "Ce lien expire bientôt. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    },
    password_changed: {
      title: "Mot de passe modifié",
      intro:
        "Votre mot de passe ghost.ma vient d'être modifié. Si vous n'êtes pas à l'origine de cette action, contactez le support immédiatement.",
      ctaLabel: "Ouvrir la sécurité du compte",
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
      intro: text,
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
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width: 36px; height: 36px; border-radius: 10px; background: #3e7bfa; color: #ffffff; font-family: Arial, sans-serif; font-weight: 800; text-align: center; vertical-align: middle;">
                      g
                    </td>
                    <td style="padding-left: 12px; color: #ffffff; font-family: Arial, sans-serif; font-size: 20px; font-weight: 800;">
                      ghost.ma
                    </td>
                  </tr>
                </table>
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
              <td style="padding: 22px 8px 0; color: #7f899c; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.7; text-align: center;">
                Besoin d'aide ? Contactez-nous à
                <a href="mailto:${escapeHtml(supportEmail)}" style="color: #9fb4ff;">${escapeHtml(supportEmail)}</a>
                ${supportWhatsapp ? `ou WhatsApp ${escapeHtml(supportWhatsapp)}` : ""}.<br />
                © ${escapeHtml(currentYear)} ghost.ma
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

  const subject = render(template.subject);
  const text = render(template.body);
  return {
    subject,
    text,
    html: brandedEmailHtml(key, subject, text, baseVariables),
  };
}
