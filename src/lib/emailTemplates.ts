import type { StoreSettings } from "./storeSettings";
import {
  type BodyBlock,
  type EmailDoc,
  type StatusKey,
  getEmailBaseUrl,
  renderGhostEmail,
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

/** Legacy plain wrapper (kept for compatibility; not used for branded sends). */
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

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
  for (const [key, value] of Object.entries(base)) {
    if (key.endsWith("_url") && typeof value === "string" && value) {
      base[key] = toAbsoluteUrl(value);
    }
  }
  return base;
}

// ── Master-template mapping ────────────────────────────────────────────────────
//   T1 Information  · welcome, email_confirmation, password_reset, awaiting_payment
//   T2 Order status · order_received, proof_received, payment_confirmed, refund_update
//   T3 Action req.  · payment_rejected, new_proof_requested
//   T4 Delivery     · order_delivered

const FR_CONTEXT: Partial<Record<EmailTemplateKey, string>> = {
  welcome: "BIENVENUE",
  email_confirmation: "VÉRIFICATION",
  password_reset: "SÉCURITÉ DU COMPTE",
  awaiting_payment: "PAIEMENT",
};

const T1_HERO: Partial<Record<EmailTemplateKey, string>> = {
  welcome: "account-blue",
  email_confirmation: "check-blue",
  password_reset: "account-blue",
  awaiting_payment: "payment-blue",
};

function supportCtaUrl(base: Variables): string {
  return (
    whatsappLink(str(base.support_whatsapp)) ||
    (str(base.support_email) ? `mailto:${str(base.support_email)}` : getEmailBaseUrl())
  );
}

function commonDoc(
  settings: StoreSettings,
  base: Variables,
  subject: string,
  tagline: string,
): Pick<EmailDoc, "title" | "footerTagline" | "supportEmail" | "supportWhatsapp" | "year" | "siteName"> {
  return {
    title: subject,
    footerTagline: tagline,
    supportEmail: str(base.support_email),
    supportWhatsapp: str(base.support_whatsapp),
    year: str(base.current_year),
    siteName: settings.branding.logoText || "ghost.ma",
  };
}

const T1_TAGLINE =
  "Produits numériques & cartes prépayées, livrés instantanément au Maroc.";
const T2_TAGLINE = "Suivez votre commande à tout moment depuis votre compte ghost.ma.";
const T3_TAGLINE = "Notre équipe support est disponible en français et en arabe.";
const T4_TAGLINE = "Merci pour votre achat. Vos codes sont aussi archivés dans votre compte.";

function buildEmailDoc(
  settings: StoreSettings,
  key: EmailTemplateKey,
  subject: string,
  bodyText: string,
  base: Variables,
): EmailDoc {
  const name = str(base.customer_name) || "client";
  const orderNo = str(base.order_number).replace(/^#/, "");
  const total = str(base.total);
  const reason = str(base.reason);
  const paymentUrl = str(base.payment_url) || getEmailBaseUrl();
  const orderUrl = str(base.order_url) || getEmailBaseUrl();
  const deliveryUrl = str(base.delivery_url) || getEmailBaseUrl();
  const codes = str(base.codes)
    .split(/\n+/)
    .map((c) => c.trim())
    .filter(Boolean);

  // ── T1 Information ──────────────────────────────────────────────
  if (
    key === "welcome" ||
    key === "email_confirmation" ||
    key === "password_reset" ||
    key === "awaiting_payment"
  ) {
    const primary: Record<string, { label: string; url: string }> = {
      welcome: { label: "Explorer ghost.ma", url: getEmailBaseUrl() },
      email_confirmation: {
        label: "Confirmer mon e-mail",
        url: str(base.confirmation_url) || orderUrl,
      },
      password_reset: {
        label: "Réinitialiser mon mot de passe",
        url: str(base.reset_url) || getEmailBaseUrl(),
      },
      awaiting_payment: { label: "Payer maintenant", url: paymentUrl },
    };
    const subtitle: Record<string, string> = {
      welcome: "Votre compte ghost.ma est prêt.",
      email_confirmation: "Confirmez votre adresse e-mail pour sécuriser votre compte.",
      password_reset: "Réinitialisez votre mot de passe en toute sécurité.",
      awaiting_payment: `Voici comment régler la commande #${orderNo}.`,
    };
    const blocks: BodyBlock[] = [];
    if (key === "awaiting_payment") {
      blocks.push({ kind: "miniOrder", orderNumber: orderNo, total });
    }
    const doc: EmailDoc = {
      ...commonDoc(settings, base, subject, T1_TAGLINE),
      contextLabel: FR_CONTEXT[key],
      hero: { iconName: T1_HERO[key] ?? "account-blue", status: "info" },
      subtitle: subtitle[key],
      message: bodyText,
      blocks,
      primary: primary[key],
      previewText: subtitle[key],
    };
    if (key === "email_confirmation" || key === "password_reset") {
      doc.blocks = [
        ...blocks,
        {
          kind: "closing",
          status: "info",
          iconName: "info-blue",
          html: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
        },
      ];
    }
    return doc;
  }

  // ── T3 Action required ──────────────────────────────────────────
  if (key === "payment_rejected" || key === "new_proof_requested") {
    const isRejected = key === "payment_rejected";
    const steps = isRejected
      ? [
          "Vérifiez le motif indiqué ci-dessus.",
          "Renvoyez un justificatif de paiement valide et lisible.",
          "Notre équipe le revérifiera dans les plus brefs délais.",
        ]
      : [
          "Ouvrez votre commande via le bouton ci-dessous.",
          "Ajoutez un justificatif clair (montant et date visibles).",
          "Nous validerons votre paiement rapidement.",
        ];
    return {
      ...commonDoc(settings, base, subject, T3_TAGLINE),
      contextLabel: "ACTION REQUISE",
      contextStatus: "error",
      banner: {
        status: "error",
        iconName: "warning-red",
        title: "Votre commande est en pause",
        text: "Une action de votre part est nécessaire pour continuer.",
      },
      badge: { status: "error", text: isRejected ? "Paiement rejeté" : "Justificatif requis" },
      subtitle: `Bonjour ${name}, une action de votre part est nécessaire.`,
      blocks: [
        ...(reason
          ? [
              {
                kind: "reasonCard" as const,
                label: isRejected ? "Motif du refus" : "Ce qu'il manque",
                text: reason,
                status: "error" as StatusKey,
              },
            ]
          : []),
        { kind: "steps", label: "Ce que vous devez faire", items: steps },
        { kind: "miniOrder", orderNumber: orderNo, total },
        {
          kind: "closing",
          status: "warning",
          iconName: "clock-amber",
          html: "Merci de répondre rapidement pour éviter l'annulation de la commande.",
        },
      ],
      primary: { label: isRejected ? "Renvoyer un justificatif" : "Envoyer le justificatif", url: paymentUrl },
      secondary: { label: "Contacter le support", url: supportCtaUrl(base) },
      previewText: reason || "Une action de votre part est nécessaire.",
    };
  }

  // ── T4 Delivery ─────────────────────────────────────────────────
  if (key === "order_delivered") {
    const blocks: BodyBlock[] = [];
    if (codes.length) {
      blocks.push({
        kind: "codeCard",
        item: `Commande #${orderNo}`,
        variant: total ? `Montant ${total}` : undefined,
        codes,
        url: deliveryUrl,
      });
    }
    blocks.push({
      kind: "steps",
      label: "Comment utiliser votre code",
      items: [
        "Ouvrez la plateforme concernée (Steam, PSN, etc.).",
        "Saisissez le code exactement comme affiché ci-dessus.",
        "Votre solde ou abonnement est crédité immédiatement.",
      ],
    });
    blocks.push({
      kind: "supportCard",
      title: "Un problème avec votre code ?",
      text: "Réponse en moins d'une heure sur WhatsApp.",
      url: supportCtaUrl(base),
      linkLabel: "Aide",
    });
    return {
      ...commonDoc(settings, base, subject, T4_TAGLINE),
      contextLabel: `#${orderNo}`,
      centered: true,
      banner: {
        status: "success",
        iconName: "success-green",
        title: "Commande livrée",
        text: "Votre produit numérique est prêt.",
      },
      hero: { iconName: "check-white", status: "success" },
      badge: { status: "success", text: "Livré" },
      subtitle: `Bonjour ${name}, votre commande est prête.`,
      blocks,
      primary: { label: "Accéder à mes codes", url: deliveryUrl },
      previewText: "Votre commande est livrée — votre code est prêt.",
    };
  }

  // ── T2 Order status (order_received, proof_received, payment_confirmed, refund_update) ──
  const statusByKey: Record<string, { status: StatusKey; badge: string; subtitle: string }> = {
    order_received: {
      status: "info",
      badge: "Commande reçue",
      subtitle: `Bonjour ${name}, votre commande est bien enregistrée.`,
    },
    proof_received: {
      status: "info",
      badge: "Justificatif reçu",
      subtitle: `Bonjour ${name}, nous avons reçu votre justificatif.`,
    },
    payment_confirmed: {
      status: "success",
      badge: "Paiement confirmé",
      subtitle: `Bonjour ${name}, votre paiement est confirmé.`,
    },
    refund_update: {
      status: "info",
      badge: "Remboursement",
      subtitle: `Bonjour ${name}, voici une mise à jour de votre remboursement.`,
    },
  };
  const meta = statusByKey[key];

  const timelineByKey: Record<string, BodyBlock> = {
    order_received: {
      kind: "timeline",
      steps: [
        { label: "Commande créée", state: "done" },
        { label: "Paiement", note: "En attente", state: "current" },
        { label: "Vérification", state: "pending" },
        { label: "Livraison du code", state: "pending" },
      ],
    },
    proof_received: {
      kind: "timeline",
      steps: [
        { label: "Commande créée", state: "done" },
        { label: "Justificatif reçu", state: "done" },
        { label: "Vérification en cours", note: "Sous peu", state: "current" },
        { label: "Livraison du code", state: "pending" },
      ],
    },
    payment_confirmed: {
      kind: "timeline",
      steps: [
        { label: "Commande créée", state: "done" },
        { label: "Paiement reçu", state: "done" },
        { label: "Paiement confirmé", state: "done" },
        { label: "Livraison du code", note: "Bientôt", state: "current" },
      ],
    },
  };

  const blocks: BodyBlock[] = [];
  if (timelineByKey[key]) blocks.push(timelineByKey[key]);
  if (key === "refund_update" && reason) {
    blocks.push({ kind: "reasonCard", label: "Détail", text: reason, status: "info" });
  }
  blocks.push({ kind: "miniOrder", orderNumber: orderNo, total });
  if (str(base.payment_method)) {
    blocks.push({
      kind: "paymentCard",
      label: "Paiement",
      rows: [
        { label: "Méthode", value: str(base.payment_method) },
        ...(str(base.payment_reference)
          ? [{ label: "Référence", value: str(base.payment_reference), mono: true }]
          : []),
      ],
    });
  }

  const primary =
    key === "order_received"
      ? { label: "Finaliser le paiement", url: paymentUrl }
      : { label: "Voir ma commande", url: orderUrl };

  return {
    ...commonDoc(settings, base, subject, T2_TAGLINE),
    contextLabel: `#${orderNo}`,
    badge: { status: meta.status, text: meta.badge },
    subtitle: meta.subtitle,
    blocks,
    primary,
    previewText: meta.subtitle,
  };
}

/**
 * Wrap rendered subject + body copy in the matching Claude Design master
 * template. Used for saved templates and admin-edited one-off sends so every
 * email uses the designed layout.
 */
export function renderBrandedHtml(
  settings: StoreSettings,
  key: EmailTemplateKey,
  subject: string,
  bodyText: string,
  variables: Variables = {},
): string {
  const base = buildBaseVariables(settings, variables);
  return renderGhostEmail(buildEmailDoc(settings, key, subject, bodyText, base));
}

export function renderEmailTemplate(
  settings: StoreSettings,
  key: EmailTemplateKey,
  variables: Variables,
): RenderedEmailTemplate {
  const template = settings.emailTemplates[key] ?? { subject: key, body: "" };
  const base = buildBaseVariables(settings, variables);
  const render = (value: string) =>
    value.replace(/\{\{([a-z_]+)\}\}/g, (_, n: string) => str(base[n]));

  const subject = render(template.subject);
  const text = render(template.body);

  return {
    subject,
    text,
    html: renderBrandedHtml(settings, key, subject, text, variables),
  };
}
