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

// ─── Design tokens (branding unchanged — layout & hierarchy only) ─────────────

const COLOR = {
  pageBg: "#080a0f",
  cardBg: "#11141d",
  wellBg: "#0c0f17",
  border: "#232838",
  borderSoft: "#1c2130",
  accent: "#3e7bfa",
  accentText: "#9fb4ff",
  title: "#ffffff",
  bodyStrong: "#dbe3f7",
  body: "#aeb8cf",
  muted: "#8b95ac",
  faint: "#69758b",
  danger: "#f0616d",
  codeText: "#ffffff",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace";

// ─── Small utilities ──────────────────────────────────────────────────────────

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

// ─── Reusable components ────────────────────────────────────────────────────────

function brandedButton(label: string, href: string) {
  if (!href || !label) return "";
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 4px;">
      <tr>
        <td style="border-radius: 12px; background: ${COLOR.accent};">
          <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 15px 26px; color: #ffffff; font-family: ${FONT}; font-size: 15px; font-weight: 700; line-height: 20px; text-decoration: none; border-radius: 12px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

type CardRow = { label: string; value: string; mono?: boolean; accent?: boolean };

function infoCardHtml(rows: CardRow[]) {
  if (rows.length === 0) return "";
  const body = rows
    .map((row, index) => {
      const last = index === rows.length - 1;
      const border = last ? "" : `border-bottom: 1px solid ${COLOR.borderSoft};`;
      const pad = `${index === 0 ? "0" : "13px"} 0 ${last ? "0" : "13px"}`;
      const valueColor = row.accent ? COLOR.accentText : COLOR.title;
      const valueFont = row.mono ? MONO : FONT;
      return `
        <tr>
          <td style="padding: ${pad}; ${border} color: ${COLOR.muted}; font-family: ${FONT}; font-size: 13px; line-height: 20px; vertical-align: top;">
            ${escapeHtml(row.label)}
          </td>
          <td align="right" style="padding: ${pad}; ${border} color: ${valueColor}; font-family: ${valueFont}; font-size: 14px; font-weight: 700; line-height: 20px; text-align: right; vertical-align: top;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0 0; border: 1px solid ${COLOR.border}; border-radius: 14px; background: ${COLOR.wellBg};">
      <tr>
        <td style="padding: 18px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${body}
          </table>
        </td>
      </tr>
    </table>`;
}

function calloutHtml(label: string, value: string, tone: "neutral" | "danger" = "neutral") {
  if (!value) return "";
  const accent = tone === "danger" ? COLOR.danger : COLOR.accent;
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
      <tr>
        <td style="border-left: 3px solid ${accent}; border-radius: 4px; background: ${COLOR.wellBg}; padding: 13px 16px;">
          <p style="margin: 0 0 4px; color: ${COLOR.muted}; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;">${escapeHtml(label)}</p>
          <p style="margin: 0; color: ${COLOR.bodyStrong}; font-family: ${FONT}; font-size: 14px; line-height: 1.6;">${escapeHtml(value)}</p>
        </td>
      </tr>
    </table>`;
}

function noticeHtml(notice?: string) {
  if (!notice) return "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
      <tr>
        <td style="border-radius: 12px; background: rgba(62,123,250,0.10); padding: 14px 16px; color: #cbd6ee; font-family: ${FONT}; font-size: 13px; line-height: 1.6;">
          ${escapeHtml(notice)}
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
            <p style="margin: 0 0 6px; color: ${COLOR.accentText}; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;">
              Votre code${codes.length > 1 ? ` ${index + 1}` : ""}
            </p>
            <div style="border: 1px solid ${COLOR.border}; border-radius: 12px; background: #0a0d14; padding: 13px 14px; color: ${COLOR.codeText}; font-family: ${MONO}; font-size: 15px; font-weight: 700; letter-spacing: .05em; word-break: break-all;">
              ${escapeHtml(code)}
            </div>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0 0;">
      ${rows}
    </table>`;
}

function countCodes(codesValue: string) {
  return codesValue
    .split(/\r?\n/)
    .map((code) => code.trim())
    .filter(Boolean).length;
}

function emailFooterHtml(settings: StoreSettings, supportEmail: string, currentYear: string) {
  const socialLinks = getFooterSocialLinks(settings);
  const paymentBadges = getEnabledFooterPaymentBadges(settings);
  const supportWhatsappUrl = whatsappUrl(settings.footer.whatsappNumber);

  const contactHtml = `
    <tr>
      <td align="center" style="padding: 24px 8px 0; color: ${COLOR.muted}; font-family: ${FONT}; font-size: 13px; line-height: 1.7;">
        Besoin d’aide ? Écrivez-nous à
        <a href="mailto:${escapeHtml(supportEmail)}" style="color: ${COLOR.accentText}; text-decoration: none;">${escapeHtml(supportEmail)}</a>${
          supportWhatsappUrl
            ? ` ou sur <a href="${escapeHtml(supportWhatsappUrl)}" target="_blank" rel="noopener noreferrer" style="color: ${COLOR.accentText}; text-decoration: none;">WhatsApp</a>`
            : ""
        }.
      </td>
    </tr>`;

  const socialHtml = socialLinks.length
    ? `<tr>
        <td align="center" style="padding: 16px 0 0;">
          ${socialLinks
            .map(
              (link) =>
                `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(
                  link.ariaLabel,
                )}" style="display: inline-block; width: 34px; height: 34px; margin: 0 4px; border: 1px solid ${COLOR.border}; border-radius: 999px; background: #151a25; text-decoration: none;">
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
        <td align="center" style="padding: 18px 0 0;">
          ${paymentBadges
            .map(
              (badge) =>
                `<span style="display: inline-block; margin: 0 4px 8px; border: 1px solid ${COLOR.border}; border-radius: 8px; padding: 6px 9px; color: #aab4c8; font-family: ${MONO}; font-size: 11px; font-weight: 700; letter-spacing: .02em;">${escapeHtml(
                  badge.label,
                )}</span>`,
            )
            .join("")}
        </td>
      </tr>`
    : "";

  const legalLinks: { label: string; href: string }[] = [
    { label: "Conditions", href: absoluteAppUrl("/terms") },
    { label: "Confidentialité", href: absoluteAppUrl("/privacy") },
    { label: "Remboursement", href: absoluteAppUrl("/refunds") },
  ];
  const legalHtml = `
    <tr>
      <td align="center" style="padding: 18px 0 0; color: ${COLOR.faint}; font-family: ${FONT}; font-size: 12px; line-height: 1.8;">
        ${legalLinks
          .map(
            (link) =>
              `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" style="color: ${COLOR.muted}; text-decoration: none;">${escapeHtml(link.label)}</a>`,
          )
          .join(`<span style="color: ${COLOR.borderSoft};"> &nbsp;·&nbsp; </span>`)}
      </td>
    </tr>`;

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      ${contactHtml}
      ${socialHtml}
      ${paymentHtml}
      ${legalHtml}
      <tr>
        <td align="center" style="padding: 16px 8px 0; color: ${COLOR.faint}; font-family: ${FONT}; font-size: 12px;">
          © ${escapeHtml(currentYear)} ghost.ma · Tous droits réservés
        </td>
      </tr>
    </table>`;
}

// ─── Per-template content (label / title / intro / CTA / next step) ────────────

type TemplateContent = {
  label: string;
  title: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  next?: string;
  notice?: string;
  status?: string;
  reasonTone?: "neutral" | "danger";
};

function templateContent(key: EmailTemplateKey, variables: Variables): TemplateContent {
  const orderUrl = variableString(variables, "order_url");
  const paymentUrl = variableString(variables, "payment_url");
  const deliveryUrl = variableString(variables, "delivery_url");
  const accountUrl = variableString(variables, "account_url");
  const verificationUrl = variableString(variables, "verification_url");
  const resetUrl = variableString(variables, "reset_password_url");

  switch (key) {
    case "welcome":
      return {
        label: "COMPTE",
        title: "Bienvenue sur ghost.ma",
        intro: "Votre compte est prêt. Retrouvez vos commandes et vos produits numériques depuis votre espace client.",
        ctaLabel: "Ouvrir mon compte",
        ctaUrl: accountUrl,
        next: "Une question pour démarrer ? Notre support répond rapidement, tous les jours.",
      };
    case "email_verification":
      return {
        label: "COMPTE",
        title: "Vérifiez votre e-mail",
        intro: "Confirmez votre adresse e-mail pour sécuriser votre compte et activer votre espace client.",
        ctaLabel: "Vérifier mon e-mail",
        ctaUrl: verificationUrl,
        notice: "Ce lien expire bientôt. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
      };
    case "email_confirmation":
      return {
        label: "COMPTE",
        title: "Votre e-mail est confirmé",
        intro: "Votre adresse e-mail est confirmée. Votre compte ghost.ma est maintenant entièrement actif.",
        ctaLabel: "Ouvrir mon compte",
        ctaUrl: accountUrl,
      };
    case "password_reset":
      return {
        label: "COMPTE",
        title: "Réinitialisez votre mot de passe",
        intro: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte.",
        ctaLabel: "Réinitialiser mon mot de passe",
        ctaUrl: resetUrl,
        notice: "Ce lien expire bientôt. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail et votre mot de passe restera inchangé.",
      };
    case "password_changed":
      return {
        label: "COMPTE",
        title: "Votre mot de passe a été modifié",
        intro: "Le mot de passe de votre compte ghost.ma vient d’être modifié avec succès.",
        ctaLabel: "Voir la sécurité du compte",
        ctaUrl: accountUrl,
        notice: "Si vous n’êtes pas à l’origine de cette action, contactez immédiatement le support.",
      };
    case "order_received":
      return {
        label: "COMMANDE",
        title: "Commande reçue",
        intro: "Nous avons bien reçu votre commande. Finalisez le paiement pour lancer la livraison de vos codes.",
        ctaLabel: "Finaliser le paiement",
        ctaUrl: paymentUrl || orderUrl,
        status: "En attente de paiement",
        next: "Dès la réception de votre paiement, nous préparons et livrons vos codes par e-mail et dans votre espace client.",
      };
    case "awaiting_payment":
      return {
        label: "PAIEMENT",
        title: "Paiement en attente",
        intro: "Votre commande est en attente de paiement. Réglez-la pour recevoir vos codes.",
        ctaLabel: "Finaliser le paiement",
        ctaUrl: paymentUrl || orderUrl,
        status: "En attente de paiement",
        next: "Une fois le paiement reçu et vérifié, vos codes sont livrés automatiquement.",
      };
    case "proof_received":
      return {
        label: "PAIEMENT",
        title: "Paiement reçu",
        intro: "Nous avons bien reçu votre justificatif de paiement. Notre équipe le vérifie.",
        ctaLabel: "Suivre ma commande",
        ctaUrl: orderUrl || paymentUrl,
        status: "Paiement en vérification",
        next: "La vérification prend généralement quelques minutes. Vous recevrez un e-mail dès que votre paiement est confirmé.",
      };
    case "new_proof_requested":
      return {
        label: "PAIEMENT",
        title: "Nouveau justificatif requis",
        intro: "Nous avons besoin d’un nouveau justificatif pour valider le paiement de votre commande.",
        ctaLabel: "Ajouter un justificatif",
        ctaUrl: paymentUrl || orderUrl,
        status: "Justificatif requis",
        reasonTone: "neutral",
        next: "Ajoutez votre justificatif depuis le bouton ci-dessus. Notre équipe le vérifie dès réception.",
      };
    case "payment_rejected":
      return {
        label: "PAIEMENT",
        title: "Paiement non validé",
        intro: "Nous n’avons pas pu valider votre paiement pour cette commande.",
        ctaLabel: "Voir le paiement",
        ctaUrl: paymentUrl || orderUrl,
        status: "Paiement refusé",
        reasonTone: "danger",
        next: "Vérifiez les informations et réessayez, ou contactez notre support pour être accompagné.",
      };
    case "payment_confirmed":
      return {
        label: "PAIEMENT",
        title: "Paiement confirmé",
        intro: "Votre paiement est confirmé. Votre commande est en préparation.",
        ctaLabel: "Suivre ma commande",
        ctaUrl: orderUrl,
        status: "Paiement confirmé",
        next: "Vos codes vous seront envoyés dès qu’ils sont prêts, généralement sous quelques minutes.",
      };
    case "order_delivered":
      return {
        label: "COMMANDE",
        title: "Commande livrée",
        intro: "Votre commande est prête. Vos codes sont disponibles ci-dessous et depuis votre page de livraison.",
        ctaLabel: "Voir ma livraison",
        ctaUrl: deliveryUrl || orderUrl,
        status: "Livrée",
        next: "Vos codes restent accessibles à tout moment depuis votre page de livraison.",
      };
    case "refund_update":
      return {
        label: "PAIEMENT",
        title: "Mise à jour de remboursement",
        intro: "Voici une mise à jour concernant le remboursement de votre commande.",
        ctaLabel: "Suivre ma commande",
        ctaUrl: orderUrl,
        status: "Remboursement",
        reasonTone: "neutral",
        next: "Le traitement du remboursement peut prendre quelques jours selon votre moyen de paiement.",
      };
    default:
      return {
        label: "GHOST.MA",
        title: "ghost.ma",
        intro: "",
        ctaLabel: "Ouvrir ghost.ma",
        ctaUrl: accountUrl || orderUrl,
      };
  }
}

function orderCardRows(key: EmailTemplateKey, variables: Variables, status?: string): CardRow[] {
  const rows: CardRow[] = [];
  const orderNumber = variableString(variables, "order_number");
  const total = variableString(variables, "total");
  if (!orderNumber && !total) return rows; // account emails: no order card

  if (orderNumber) rows.push({ label: "Numéro de commande", value: orderNumber, mono: true });
  if (total) rows.push({ label: "Total", value: total });

  if (key === "order_delivered") {
    const count = countCodes(variableString(variables, "codes"));
    if (count > 0) {
      rows.push({ label: "Produits livrés", value: `${count} code${count > 1 ? "s" : ""}` });
    }
  }
  if (status) rows.push({ label: "Statut", value: status, accent: true });
  return rows;
}

function brandedEmailHtml(
  key: EmailTemplateKey,
  subject: string,
  variables: Variables,
  settings: StoreSettings,
) {
  const customerName = variableString(variables, "customer_name") || "client";
  const supportEmail = variableString(variables, "support_email") || "support@ghost.ma";
  const currentYear = variableString(variables, "current_year") || String(new Date().getFullYear());
  const reason = variableString(variables, "reason");
  const codes = variableString(variables, "codes");
  const logoUrl = emailLogoUrl();

  const content = templateContent(key, variables);
  const cardRows = orderCardRows(key, variables, content.status);
  const preheader = content.intro || subject;

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${escapeHtml(subject)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-wrap { padding: 20px 12px !important; }
        .email-card { padding: 26px 22px !important; }
        .email-title { font-size: 24px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: ${COLOR.pageBg}; color: #f6f7fb; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: ${COLOR.pageBg};">
      <tr>
        <td align="center" class="email-wrap" style="padding: 32px 16px 40px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto;">
            <!-- Header -->
            <tr>
              <td style="padding: 0 4px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align: middle;">
                      <img src="${escapeHtml(logoUrl)}" width="34" height="34" alt="ghost.ma" style="display: block; width: 34px; height: 34px; border: 0; border-radius: 10px;" />
                    </td>
                    <td style="padding-left: 11px; color: #ffffff; font-family: ${FONT}; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; vertical-align: middle;">
                      ghost.ma
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Card -->
            <tr>
              <td class="email-card" style="border: 1px solid ${COLOR.border}; border-radius: 18px; background: ${COLOR.cardBg}; padding: 36px 32px; box-shadow: 0 24px 70px rgba(0,0,0,0.28);">
                <p style="margin: 0 0 14px; color: ${COLOR.accentText}; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;">
                  ${escapeHtml(content.label)}
                </p>
                <h1 class="email-title" style="margin: 0; color: ${COLOR.title}; font-family: ${FONT}; font-size: 27px; font-weight: 800; line-height: 1.25; letter-spacing: -0.02em;">
                  ${escapeHtml(content.title)}
                </h1>
                <p style="margin: 22px 0 0; color: ${COLOR.bodyStrong}; font-family: ${FONT}; font-size: 15px; line-height: 1.6;">
                  Bonjour ${escapeHtml(customerName)},
                </p>
                <p style="margin: 8px 0 0; color: ${COLOR.body}; font-family: ${FONT}; font-size: 15px; line-height: 1.7;">
                  ${escapeHtml(content.intro)}
                </p>
                ${infoCardHtml(cardRows)}
                ${key === "order_delivered" ? codeListHtml(codes) : ""}
                ${brandedButton(content.ctaLabel, content.ctaUrl)}
                ${reason ? calloutHtml("Raison", reason, content.reasonTone ?? "neutral") : ""}
                ${
                  content.next
                    ? `<p style="margin: 24px 0 0; color: ${COLOR.muted}; font-family: ${FONT}; font-size: 14px; line-height: 1.7;">
                        ${escapeHtml(content.next)}
                      </p>`
                    : ""
                }
                ${noticeHtml(content.notice)}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding: 4px 8px 0;">
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
    html: brandedEmailHtml(key, subject, baseVariables, settings),
  };
}
