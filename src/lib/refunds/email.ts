import "server-only";

import {
  brandHeaderHtml,
  brandedButton,
  emailFooterHtml,
  escapeHtml,
  type RenderedEmailTemplate,
} from "@/lib/emailTemplates";
import { getEnabledFooterPaymentBadges } from "@/lib/footerConfig";
import type { StoreSettings } from "@/lib/storeSettings";
import { formatMAD } from "@/lib/format";
import type { RefundEmailTemplateKey } from "@/lib/refunds/emailShared";

/**
 * Refund-case emails. They reuse the SAME branded pieces as every other ghost.ma
 * transactional email (header lockup, blue CTA, footer) but through a dedicated
 * generic shell so the admin composer's preview and the delivered inbox mail are
 * produced by one function — they can never drift. The secure customer links
 * (info / choice) are injected as the CTA + fallback; the raw URL is only ever
 * shown as the small "si le bouton ne fonctionne pas" fallback, never inline.
 */

/** Which secure customer link (if any) a template's CTA points at. */
export function refundTemplateLink(
  key: RefundEmailTemplateKey,
): "PROVIDE_INFO" | "CHOOSE_RESOLUTION" | "WALLET" | "DELIVERY" | "ORDER" | null {
  switch (key) {
    case "info_required":
      return "PROVIDE_INFO";
    case "approved":
      return "CHOOSE_RESOLUTION";
    case "credit_issued":
      return "WALLET";
    case "replacement_delivered":
      return "DELIVERY";
    case "refund_sent":
      return "ORDER";
    case "not_eligible":
      return null;
  }
}

export type RefundEmailContext = {
  customerName: string;
  orderNumber: string;
  refundNumber: string;
  amountMad: number;
  currency: string;
  /** Method label for the "refund sent" email. */
  method?: string;
  /** Free-form request detail admins fill in for the info email. */
  customRequest?: string;
  /** Motif for the rejection email. */
  rejectionReason?: string;
};

const NOTICE_ORIGINAL_METHOD =
  "Un remboursement vers le moyen de paiement d’origine est généralement traité sous 1 à 2 jours ouvrables après la confirmation de votre choix. Le délai d’apparition des fonds peut ensuite dépendre de votre banque ou de votre prestataire de paiement.";

/**
 * Editable defaults for a template. `subject` and `body` are what the composer
 * pre-fills and the admin may edit before sending; `ctaLabel`/`notice`/`motif`
 * shape the shell. Placeholders are already interpolated from `ctx`.
 */
export function refundEmailDefaults(
  key: RefundEmailTemplateKey,
  ctx: RefundEmailContext,
): { subject: string; body: string; ctaLabel: string | null; notice: string | null; motif: string | null } {
  const { customerName, orderNumber, amountMad, currency, method } = ctx;
  const amount = currency === "MAD" ? formatMAD(amountMad) : `${amountMad} ${currency}`;
  switch (key) {
    case "info_required":
      return {
        subject: `Informations complémentaires requises — ${orderNumber}`,
        body: [
          `Afin de poursuivre l’examen de votre demande concernant la commande ${orderNumber}, nous avons besoin d’une nouvelle capture d’écran montrant clairement :`,
          ctx.customRequest?.trim() || "…",
          "Vous pouvez transmettre les informations demandées en cliquant sur le bouton ci-dessous.",
          "Merci pour votre coopération.",
        ].join("\n\n"),
        ctaLabel: "Ajouter les informations demandées",
        notice: null,
        motif: null,
      };
    case "approved":
      return {
        subject: `Votre demande a été acceptée — ${orderNumber}`,
        body: [
          `Nous sommes désolés pour le problème rencontré avec votre commande ${orderNumber}.`,
          "Après examen de votre demande, nous vous confirmons que celle-ci a été acceptée.",
          "Vous pouvez maintenant choisir la solution qui vous convient le mieux en cliquant sur le bouton ci-dessous.",
          "Merci pour votre patience et votre confiance.",
        ].join("\n\n"),
        ctaLabel: "Choisir ma solution",
        notice: NOTICE_ORIGINAL_METHOD,
        motif: null,
      };
    case "not_eligible":
      return {
        subject: `Décision concernant votre demande — ${orderNumber}`,
        body: [
          `Après examen de votre demande concernant la commande ${orderNumber}, celle-ci ne peut malheureusement pas faire l’objet d’un remboursement.`,
          "Si vous pensez qu’une information importante n’a pas été prise en compte, vous pouvez répondre à cet e-mail ou contacter notre assistance.",
        ].join("\n\n"),
        ctaLabel: null,
        notice: null,
        motif: ctx.rejectionReason?.trim() || null,
      };
    case "refund_sent":
      return {
        subject: `Votre remboursement a été envoyé — ${orderNumber}`,
        body: [
          `Le remboursement de ${amount} concernant la commande ${orderNumber} a été envoyé via ${method ?? "votre moyen de paiement d’origine"}.`,
          "Pour un remboursement vers le moyen de paiement d’origine, les fonds peuvent prendre 1 à 2 jours ouvrables pour apparaître. Un délai supplémentaire peut parfois dépendre de votre banque ou de votre prestataire de paiement.",
        ].join("\n\n"),
        ctaLabel: null,
        notice: null,
        motif: null,
      };
    case "credit_issued":
      return {
        subject: `Votre Crédit Ghost a été ajouté — ${orderNumber}`,
        body: [
          `Nous avons ajouté ${amount} en Crédit Ghost à votre compte ghost.ma pour la commande ${orderNumber}.`,
          "Ce crédit est immédiatement disponible et pourra être utilisé sur une prochaine commande.",
        ].join("\n\n"),
        ctaLabel: "Voir mon Crédit Ghost",
        notice: null,
        motif: null,
      };
    case "replacement_delivered":
      return {
        subject: `Votre produit de remplacement — ${orderNumber}`,
        body: [
          `Votre produit de remplacement pour la commande ${orderNumber} est disponible.`,
          "Pour protéger votre code, il n’est pas affiché dans cet e-mail. Consultez votre page de livraison sécurisée pour y accéder.",
        ].join("\n\n"),
        ctaLabel: "Voir ma livraison",
        notice: null,
        motif: null,
      };
  }
}

function paragraphsHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin: 14px 0 0; color: #4b5563; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7;">${escapeHtml(
          p,
        ).replace(/\r?\n/g, "<br />")}</p>`,
    )
    .join("");
}

function motifBlock(motif: string): string {
  return `<div style="margin: 20px 0 0; border-left: 3px solid #e05c5c; border-radius: 8px; background: #fdf2f2; padding: 14px 16px;">
    <div style="color: #9b2c2c; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;">Motif</div>
    <div style="margin-top: 6px; color: #4b5563; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(
      motif,
    ).replace(/\r?\n/g, "<br />")}</div>
  </div>`;
}

export type RenderRefundEmailInput = {
  subject: string;
  body: string;
  customerName: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  notice?: string | null;
  motif?: string | null;
  settings: StoreSettings;
};

/** Render {subject, html, text}. Preview and send both call this. */
export function renderRefundEmail(input: RenderRefundEmailInput): RenderedEmailTemplate {
  const settings = input.settings;
  const supportEmail = process.env.SUPPORT_EMAIL || settings.footer.contactEmail;
  const currentYear = String(new Date().getFullYear());
  const paymentBadges = getEnabledFooterPaymentBadges(settings);
  const customerName = input.customerName || "client";
  const showCta = !!(input.ctaLabel && input.ctaUrl);

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>:root { color-scheme: light only; supported-color-schemes: light; }</style>
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #eef1f7; color: #1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #eef1f7; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px;">
            <tr><td style="padding: 0 0 18px;">${brandHeaderHtml()}</td></tr>
            <tr>
              <td style="border: 1px solid #e6e9f0; border-radius: 18px; background: #ffffff; padding: 34px 30px; box-shadow: 0 20px 48px rgba(16,23,41,0.08);">
                <p style="margin: 0 0 12px; color: #3e7bfa; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">Remboursement</p>
                <h1 style="margin: 0; color: #0f1729; font-family: Arial, sans-serif; font-size: 26px; line-height: 1.25;">${escapeHtml(
                  input.subject,
                )}</h1>
                <p style="margin: 20px 0 0; color: #1f2937; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.7;">Bonjour ${escapeHtml(
                  customerName,
                )},</p>
                ${paragraphsHtml(input.body)}
                ${input.motif ? motifBlock(input.motif) : ""}
                ${showCta ? brandedButton(input.ctaLabel!, input.ctaUrl!) : ""}
                ${
                  showCta
                    ? `<p style="margin: 16px 0 0; color: #6b7280; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;">Si le bouton ne fonctionne pas correctement, <a href="${escapeHtml(
                        input.ctaUrl!,
                      )}" style="color: #3e7bfa; word-break: break-all;">cliquez ici</a>.</p>`
                    : ""
                }
                ${
                  input.notice
                    ? `<p style="margin: 20px 0 0; border-radius: 12px; background: #eff4ff; padding: 14px 16px; color: #33415c; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;">${escapeHtml(
                        input.notice,
                      )}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr><td>${emailFooterHtml(settings, supportEmail, currentYear, paymentBadges)}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `Bonjour ${customerName},`,
    "",
    ...input.body.split(/\n{2,}/).map((p) => p.trim()),
  ];
  if (input.motif) textLines.push("", `Motif : ${input.motif}`);
  if (showCta) textLines.push("", `${input.ctaLabel} : ${input.ctaUrl}`);
  if (input.notice) textLines.push("", input.notice);

  return { subject: input.subject, html, text: textLines.join("\n") };
}
