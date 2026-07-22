/**
 * Admin Email Composer — the ONE renderer.
 *
 * Both the live preview and the actual send call this exact function, so the
 * preview can never diverge from the inbox mail. It reuses the same branded shell
 * (header, footer, button styles, light-by-design meta) as the transactional
 * emails via the helpers exported from emailTemplates.ts.
 *
 * Pure: no Prisma, no "server-only". Given a fully-resolved composition + the
 * recipient's variable map + the shell context, it produces the final HTML, the
 * plain-text alternative, and the list of unresolved variables for that
 * recipient (drives the pre-send warning).
 */

import type { StoreSettings } from "@/lib/storeSettings";
import { brandHeaderHtml, emailFooterHtml, brandedButton, escapeHtml } from "@/lib/emailTemplates";
import {
  type EmailModule,
  type VariableMap,
  substituteVariables,
  findMissingVariables,
  moduleTextFields,
} from "./composerModules";

export type ComposedEmailInput = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  greetingName?: string;
  modules: EmailModule[];
};

export type ComposedShellContext = {
  settings: StoreSettings;
  supportEmail: string;
  currentYear: string;
  paymentBadges: { label: string }[];
};

export type ComposedEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  /** Variables referenced but unresolved for this recipient. */
  missingVariables: string[];
};

function fmtMad(mad: number): string {
  return `${mad} DH`;
}

function noticeColors(style: string): { bg: string; border: string; label: string; labelText: string } {
  switch (style) {
    case "success":
      return { bg: "#effaf3", border: "#bfe6cd", label: "Succès", labelText: "#1a7f47" };
    case "warning":
      return { bg: "#fff8ec", border: "#f3dcae", label: "Attention", labelText: "#8a5a00" };
    case "error":
      return { bg: "#fdecec", border: "#f2c0c0", label: "Important", labelText: "#a12525" };
    default:
      return { bg: "#eff4ff", border: "#d7defa", label: "Information", labelText: "#33415c" };
  }
}

// ── Per-module HTML ──────────────────────────────────────────────────────────

function moduleHtml(module: EmailModule, vars: VariableMap): string {
  const sub = (s: string) => substituteVariables(s, vars);
  switch (module.type) {
    case "text": {
      const heading = module.heading
        ? `<h2 style="margin: 0 0 8px; color: #0f1729; font-family: Arial, sans-serif; font-size: 18px; line-height: 1.3;">${escapeHtml(
            sub(module.heading),
          )}</h2>`
        : "";
      const align = module.align ?? "justify";
      return `<div style="margin: 18px 0 0; text-align: ${align};">${heading}<p style="margin: 0; color: #4b5563; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7;">${escapeHtml(
        sub(module.body),
      ).replace(/\r?\n/g, "<br />")}</p></div>`;
    }
    case "credit": {
      const expiry = module.expiresAt
        ? `<div style="margin-top: 10px; color: #6b7280; font-family: Arial, sans-serif; font-size: 12px;">Valable jusqu'au ${escapeHtml(
            formatDate(module.expiresAt),
          )}</div>`
        : "";
      const button = module.buttonLabel
        ? brandedButton(sub(module.buttonLabel), "/account/wallet")
        : "";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 22px 0 0;">
        <tr>
          <td align="center" style="border: 1px solid #d7defa; border-radius: 16px; background: linear-gradient(180deg,#f2f6ff,#ffffff); padding: 24px 20px;">
            <div style="color: #3e7bfa; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">${escapeHtml(
              sub(module.title),
            )}</div>
            <div style="margin-top: 8px; color: #0f1729; font-family: Arial, sans-serif; font-size: 34px; font-weight: 800;">${escapeHtml(
              fmtMad(module.amountMad),
            )}</div>
            ${
              module.description
                ? `<p style="margin: 10px 0 0; color: #4b5563; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(
                    sub(module.description),
                  ).replace(/\r?\n/g, "<br />")}</p>`
                : ""
            }
            ${expiry}
            ${button}
          </td>
        </tr>
      </table>`;
    }
    case "button": {
      const align = module.align ?? "center";
      const bg = module.style === "secondary" ? "#0f1729" : "#3e7bfa";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td align="${align}">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="border-radius: 12px; background: ${bg};">
              <a href="${escapeHtml(module.url)}" style="display: inline-block; padding: 13px 22px; color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; text-decoration: none;">${escapeHtml(
                sub(module.label),
              )}</a>
            </td>
          </tr></table>
        </td></tr>
      </table>`;
    }
    case "order": {
      const link = module.orderUrl
        ? `<a href="${escapeHtml(module.orderUrl)}" style="color: #3e7bfa; font-family: Arial, sans-serif; font-size: 13px; text-decoration: none;">Voir ma commande →</a>`
        : "";
      const row = (label: string, value: string) =>
        value
          ? `<tr><td style="padding: 3px 0; color: #6b7280; font-family: Arial, sans-serif; font-size: 13px;">${escapeHtml(
              label,
            )}</td><td style="padding: 3px 0; color: #1f2937; font-family: Arial, sans-serif; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(
              value,
            )}</td></tr>`
          : "";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td style="border: 1px solid #e6e9f0; border-radius: 12px; background: #f7f9fc; padding: 16px 18px;">
          <div style="color: #3e7bfa; font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 8px;">Commande ${escapeHtml(
            module.orderNumber,
          )}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${row("Statut", module.status)}
            ${row("Produit", module.productSummary)}
            ${row("Montant", module.totalMad ? fmtMad(module.totalMad) : "")}
          </table>
          ${link ? `<div style="margin-top: 10px;">${link}</div>` : ""}
        </td></tr>
      </table>`;
    }
    case "payment": {
      const lines = module.lines
        .map(
          (l) =>
            `<div style="color: #1f2937; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(
              l,
            )}</div>`,
        )
        .join("");
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td style="border: 1px solid #e6e9f0; border-radius: 12px; background: #ffffff; padding: 16px 18px;">
          <div style="color: #0f1729; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(
            module.methodName || "Instructions de paiement",
          )}</div>
          ${lines}
        </td></tr>
      </table>`;
    }
    case "coupon": {
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td align="center" style="border: 1px dashed #3e7bfa; border-radius: 12px; background: #f2f6ff; padding: 18px 16px;">
          <div style="color: #6b7280; font-family: Arial, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: .06em;">Code promo</div>
          <div style="margin-top: 6px; color: #0f1729; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 800; letter-spacing: .12em;">${escapeHtml(
            module.code,
          )}</div>
          ${
            module.valueLabel
              ? `<div style="margin-top: 6px; color: #1a7f47; font-family: Arial, sans-serif; font-size: 14px; font-weight: 600;">${escapeHtml(
                  module.valueLabel,
                )}</div>`
              : ""
          }
          ${
            module.expiresAt
              ? `<div style="margin-top: 4px; color: #6b7280; font-family: Arial, sans-serif; font-size: 12px;">Expire le ${escapeHtml(
                  formatDate(module.expiresAt),
                )}</div>`
              : ""
          }
          ${
            module.conditions
              ? `<div style="margin-top: 6px; color: #6b7280; font-family: Arial, sans-serif; font-size: 12px;">${escapeHtml(
                  module.conditions,
                )}</div>`
              : ""
          }
        </td></tr>
      </table>`;
    }
    case "divider":
      return `<div style="margin: 22px 0 0; border-top: 1px solid #e6e9f0;"></div>`;
    case "notice": {
      const c = noticeColors(module.style);
      const heading = module.heading
        ? `<div style="color: ${c.labelText}; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(
            sub(module.heading),
          )}</div>`
        : "";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td style="border: 1px solid ${c.border}; border-radius: 12px; background: ${c.bg}; padding: 14px 16px;">
          ${heading}
          <div style="color: #1f2937; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(
            sub(module.body),
          ).replace(/\r?\n/g, "<br />")}</div>
        </td></tr>
      </table>`;
    }
    case "product": {
      const img = module.imageUrl
        ? `<img src="${escapeHtml(
            module.imageUrl,
          )}" width="64" height="64" alt="" style="display: block; width: 64px; height: 64px; border-radius: 10px; border: 1px solid #e6e9f0; object-fit: cover;" />`
        : "";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0 0;">
        <tr><td style="border: 1px solid #e6e9f0; border-radius: 12px; background: #ffffff; padding: 14px 16px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            ${img ? `<td width="64" style="padding-right: 14px; vertical-align: top;">${img}</td>` : ""}
            <td style="vertical-align: top;">
              <div style="color: #0f1729; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700;">${escapeHtml(
                module.name,
              )}</div>
              ${
                module.region
                  ? `<div style="margin-top: 2px; color: #6b7280; font-family: Arial, sans-serif; font-size: 12px;">${escapeHtml(
                      module.region,
                    )}</div>`
                  : ""
              }
              ${
                module.priceMad
                  ? `<div style="margin-top: 4px; color: #3e7bfa; font-family: Arial, sans-serif; font-size: 14px; font-weight: 700;">${escapeHtml(
                      fmtMad(module.priceMad),
                    )}</div>`
                  : ""
              }
              ${
                module.productUrl
                  ? `<div style="margin-top: 6px;"><a href="${escapeHtml(
                      module.productUrl,
                    )}" style="color: #3e7bfa; font-family: Arial, sans-serif; font-size: 13px; text-decoration: none;">Voir le produit →</a></div>`
                  : ""
              }
            </td>
          </tr></table>
        </td></tr>
      </table>`;
    }
    case "signature": {
      const title = module.title
        ? `<div style="color: #6b7280; font-family: Arial, sans-serif; font-size: 13px;">${escapeHtml(
            sub(module.title),
          )}</div>`
        : "";
      const text = module.text
        ? `<div style="margin-top: 6px; color: #4b5563; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${escapeHtml(
            sub(module.text),
          ).replace(/\r?\n/g, "<br />")}</div>`
        : "";
      return `<div style="margin: 22px 0 0;">
        <div style="color: #0f1729; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700;">${escapeHtml(
          sub(module.name),
        )}</div>
        ${title}${text}
      </div>`;
    }
    default:
      return "";
  }
}

function formatDate(iso: string): string {
  // Deterministic dd/mm/yyyy — no locale dependence, safe in tests.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

// ── Plain-text alternative ───────────────────────────────────────────────────

function moduleText(module: EmailModule, vars: VariableMap): string {
  const sub = (s: string) => substituteVariables(s, vars);
  switch (module.type) {
    case "text":
      return [module.heading ? sub(module.heading) : "", sub(module.body)].filter(Boolean).join("\n");
    case "credit":
      return [
        sub(module.title),
        fmtMad(module.amountMad),
        module.description ? sub(module.description) : "",
        module.expiresAt ? `Valable jusqu'au ${formatDate(module.expiresAt)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "button":
      return `${sub(module.label)} : ${module.url}`;
    case "order":
      return [
        `Commande ${module.orderNumber}`,
        module.status ? `Statut : ${module.status}` : "",
        module.productSummary ? `Produit : ${module.productSummary}` : "",
        module.totalMad ? `Montant : ${fmtMad(module.totalMad)}` : "",
        module.orderUrl || "",
      ]
        .filter(Boolean)
        .join("\n");
    case "payment":
      return [module.methodName || "Instructions de paiement", ...module.lines].join("\n");
    case "coupon":
      return [
        `Code promo : ${module.code}`,
        module.valueLabel || "",
        module.expiresAt ? `Expire le ${formatDate(module.expiresAt)}` : "",
        module.conditions || "",
      ]
        .filter(Boolean)
        .join("\n");
    case "divider":
      return "———";
    case "notice":
      return [module.heading ? sub(module.heading) : "", sub(module.body)].filter(Boolean).join("\n");
    case "product":
      return [
        module.name,
        module.region || "",
        module.priceMad ? fmtMad(module.priceMad) : "",
        module.productUrl || "",
      ]
        .filter(Boolean)
        .join("\n");
    case "signature":
      return [sub(module.name), module.title ? sub(module.title) : "", module.text ? sub(module.text) : ""]
        .filter(Boolean)
        .join("\n");
    default:
      return "";
  }
}

// ── Public renderer ──────────────────────────────────────────────────────────

export function renderComposedEmail(
  input: ComposedEmailInput,
  vars: VariableMap,
  ctx: ComposedShellContext,
): ComposedEmail {
  const subject = substituteVariables(input.subject, vars);
  const preheader = substituteVariables(input.preheader, vars);
  const title = substituteVariables(input.title, vars);
  const eyebrow = substituteVariables(input.eyebrow, vars) || "Ghost.ma";
  const greeting = `Bonjour ${input.greetingName?.trim() || "client"},`;

  const bodyHtml = input.modules.map((m) => moduleHtml(m, vars)).join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      :root { color-scheme: light only; supported-color-schemes: light; }
    </style>
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #eef1f7; color: #1f2937;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #eef1f7; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 620px;">
            <tr>
              <td style="padding: 0 0 18px;">${brandHeaderHtml()}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #e6e9f0; border-radius: 18px; background: #ffffff; padding: 34px 30px; box-shadow: 0 20px 48px rgba(16,23,41,0.08);">
                <p style="margin: 0 0 12px; color: #3e7bfa; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">${escapeHtml(
                  eyebrow,
                )}</p>
                ${
                  title
                    ? `<h1 style="margin: 0; color: #0f1729; font-family: Arial, sans-serif; font-size: 28px; line-height: 1.2;">${escapeHtml(
                        title,
                      )}</h1>`
                    : ""
                }
                <p style="margin: 20px 0 0; color: #1f2937; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.7;">${escapeHtml(
                  greeting,
                )}</p>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td>${emailFooterHtml(ctx.settings, ctx.supportEmail, ctx.currentYear, ctx.paymentBadges)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textParts = [greeting, "", ...input.modules.map((m) => moduleText(m, vars)).filter(Boolean)];
  const text = textParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  const allTexts = [
    input.subject,
    input.preheader,
    input.title,
    ...input.modules.flatMap((m) => moduleTextFields(m)),
  ];
  const missingVariables = findMissingVariables(allTexts, vars);

  return { subject, preheader, html, text, missingVariables };
}
