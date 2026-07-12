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
  | "refund_update"
  | "support_received"
  | "support_reply"
  | "support_closed";

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
  // Navigator horizontal lockup (PNG — no SVG in e-mail). Source is 1800×500,
  // rendered at 130×36 so it stays within the ≤36px-tall header banner.
  return absoluteAppUrl("/brand/ghostma-navigator-horizontal.png");
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
        <td align="center" style="padding: 12px 8px 0; color: #69758b; font-family: Arial, sans-serif; font-size: 12px;">
          <img src="${escapeHtml(
            absoluteAppUrl("/brand/navigator-icon-32.png"),
          )}" width="18" height="18" alt="" style="display: inline-block; vertical-align: middle; margin-right: 7px; border: 0;" />
          <span style="vertical-align: middle;">© ${escapeHtml(currentYear)} ghost.ma</span>
        </td>
      </tr>
    </table>`;
}

/**
 * Shared configuration for the admin "review" emails (reject / request-proof /
 * refund). They all use the same clean shell: greeting owned by the shell once,
 * the editable message as the body, an optional labelled Motif block from the
 * reason, and a CTA button — never a raw URL or an inline "Raison :" in the body.
 * The plain-text (below) mirrors this exactly, turning the button into a link.
 */
const REVIEW_TEMPLATE_META: Partial<
  Record<EmailTemplateKey, { motifLabel: string; ctaText: string; ctaUrlVar: string }>
> = {
  new_proof_requested: {
    motifLabel: "Motif de la demande",
    ctaText: "Ajoutez un nouveau justificatif de paiement ici :",
    ctaUrlVar: "payment_url",
  },
  payment_rejected: {
    motifLabel: "Motif du refus",
    ctaText: "Consultez le détail du paiement ici :",
    ctaUrlVar: "payment_url",
  },
  refund_update: {
    motifLabel: "Motif du remboursement",
    ctaText: "Suivez votre commande ici :",
    ctaUrlVar: "order_url",
  },
  support_reply: {
    motifLabel: "Réponse de notre équipe",
    ctaText: "Consultez votre demande ici :",
    ctaUrlVar: "support_url",
  },
  support_closed: {
    motifLabel: "Statut de clôture",
    ctaText: "Partagez votre avis sur notre support ici :",
    ctaUrlVar: "feedback_url",
  },
};

/** Optional labelled reason block. Rendered only when a reason exists. */
function motifBlockHtml(reason: string, label: string) {
  if (!reason) return "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 22px 0 0;">
      <tr>
        <td style="border: 1px solid #2f3954; border-radius: 12px; background: #0a0d14; padding: 14px 16px;">
          <p style="margin: 0 0 6px; color: #9fb4ff; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;">
            ${escapeHtml(label)}
          </p>
          <p style="margin: 0; color: #d9e2ff; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6;">
            ${escapeHtml(reason).replace(/\r?\n/g, "<br />")}
          </p>
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
  const supportUrl = variableString(variables, "support_url");
  const feedbackUrl = variableString(variables, "feedback_url");
  const reason = variableString(variables, "reason").trim();
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
      )} est disponible. Pour protéger vos codes, ils ne sont pas affichés directement dans cet e-mail. Consultez votre page de livraison sécurisée pour accéder à votre commande.`,
      ctaLabel: "Voir ma livraison",
      ctaUrl: deliveryUrl || orderUrl,
      notice: "Vos codes restent accessibles depuis votre espace client.",
    },
    refund_update: {
      title: subject,
      intro: text,
      ctaLabel: "Suivre ma commande",
      ctaUrl: orderUrl,
    },
    support_received: {
      title: subject,
      intro: text,
      ctaLabel: "Suivre ma demande",
      ctaUrl: supportUrl,
    },
    support_reply: {
      title: subject,
      intro: text,
      ctaLabel: "Voir ma demande",
      ctaUrl: supportUrl,
    },
    support_closed: {
      title: subject,
      intro: text,
      ctaLabel: "Donner mon avis",
      ctaUrl: feedbackUrl,
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
                  <img src="${escapeHtml(logoUrl)}" width="130" height="36" alt="Ghost.ma" style="display: block; width: 130px; height: 36px; border: 0;" />
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
                  ${escapeHtml(selected.intro).replace(/\r?\n/g, "<br />")}
                </p>
                ${REVIEW_TEMPLATE_META[key] ? motifBlockHtml(reason, REVIEW_TEMPLATE_META[key]!.motifLabel) : ""}
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
  const customerName = variableString(baseVariables, "customer_name") || "client";
  // The HTML shell owns the greeting, heading, CTA and footer; the body it
  // renders (intro) is always `renderedBody` — the editable message only. The
  // plain-text below is composed separately for templates that need buttons
  // (unavailable in text) turned into links, but never re-derives the body.
  const text =
    key === "password_changed"
      ? [
          `Bonjour ${customerName},`,
          "",
          "Le mot de passe de votre compte ghost.ma vient d’être modifié.",
          "",
          "Si vous n’êtes pas à l’origine de cette action, contactez immédiatement le support.",
        ].join("\n")
      : key === "order_delivered"
      ? [
          `Bonjour ${customerName},`,
          "",
          `Votre commande ${variableString(baseVariables, "order_number")} est disponible.`,
          "",
          "Pour protéger vos codes, ils ne sont pas affichés dans cet e-mail.",
          "Consultez votre page de livraison sécurisée pour accéder à votre commande :",
          variableString(baseVariables, "delivery_url"),
          "",
          "Vos codes restent accessibles depuis votre espace client.",
          "",
          "Merci pour votre achat.",
        ].join("\n")
      : REVIEW_TEMPLATE_META[key]
      ? (() => {
          const meta = REVIEW_TEMPLATE_META[key]!;
          const reasonText = variableString(baseVariables, "reason").trim();
          return [
            `Bonjour ${customerName},`,
            "",
            renderedBody,
            ...(reasonText ? ["", `${meta.motifLabel} :`, reasonText] : []),
            "",
            meta.ctaText,
            variableString(baseVariables, meta.ctaUrlVar),
          ].join("\n");
        })()
      : renderedBody;
  return {
    subject,
    text,
    // Always pass the message body (never the composed plain-text) so the shell
    // greeting is added exactly once.
    html: brandedEmailHtml(key, subject, renderedBody, baseVariables, settings),
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
  support_received: "Support — demande reçue",
  support_reply: "Support — réponse envoyée",
  support_closed: "Support — demande clôturée",
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
    { key: "total", sample: "250 DH" },
  ],
  awaiting_payment: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "payment_url", sample: "https://ghost.ma/payment/example" },
    { key: "total", sample: "250 DH" },
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
  ],
  refund_update: [
    { key: "customer_name", sample: "Amine" },
    { key: "order_number", sample: "#000128" },
    { key: "order_url", sample: "https://ghost.ma/order/example" },
    { key: "reason", sample: "Remboursement partiel" },
    { key: "total", sample: "250 DH" },
  ],
  support_received: [
    { key: "customer_name", sample: "Amine" },
    { key: "reference", sample: "GH-S-482913" },
    { key: "subject", sample: "Livraison — Je n'ai rien reçu" },
    { key: "support_url", sample: "https://ghost.ma/support/suivi" },
  ],
  support_reply: [
    { key: "customer_name", sample: "Amine" },
    { key: "reference", sample: "GH-S-482913" },
    { key: "reason", sample: "Bonjour, votre code a été renvoyé à votre adresse e-mail." },
    { key: "support_url", sample: "https://ghost.ma/support/suivi" },
  ],
  support_closed: [
    { key: "customer_name", sample: "Amine" },
    { key: "reference", sample: "GH-S-482913" },
    { key: "reason", sample: "Résolu" },
    { key: "feedback_url", sample: "https://ghost.ma/support/feedback?token=example" },
  ],
};

export function sampleVariablesForKey(key: EmailTemplateKey): Record<string, string> {
  const vars = EMAIL_TEMPLATE_VARIABLES[key] ?? [];
  return Object.fromEntries(vars.map((variable) => [variable.key, variable.sample]));
}
