// Reusable, email-client-safe branded layout for all ghost.ma transactional
// emails. Pure string builders (no server-only deps) so they can run anywhere.
//
// Design constraints for real inboxes (Gmail, Apple Mail, Outlook):
//  - table-based structure, everything inlined (no <style>/media queries)
//  - explicit dark background + light text on every cell (Gmail ignores <head>)
//  - "bulletproof" table button for the CTA

const COLORS = {
  bg: "#0a0b0d",
  card: "#121319",
  panel: "#0f1116",
  border: "#1d1f27",
  borderStrong: "#2c2f3a",
  text: "#f3f4f7",
  muted: "#c2c7d2",
  faint: "#7a808d",
  accent: "#3e7bfa",
  link: "#5e92ff",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function getEmailBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.EMAIL_BASE_URL || "https://ghost.ma";
  return raw.trim().replace(/\/+$/, "");
}

/** Turn a relative path ("/payment/x") into an absolute email-safe URL. */
export function toAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${getEmailBaseUrl()}${trimmed}`;
  return `${getEmailBaseUrl()}/${trimmed}`;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render the body text into styled, dark-mode-safe paragraphs. Blank lines
 * separate paragraphs; single newlines become <br>. Bare http(s) URLs are
 * auto-linked so links stay clickable even outside the CTA button.
 */
export function renderParagraphs(text: string): string {
  const linkify = (escaped: string) =>
    escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => `<a href="${url}" style="color:${COLORS.link};text-decoration:underline;">${url}</a>`,
    );

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const html = linkify(escapeEmailHtml(paragraph)).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.muted};">${html}</p>`;
    })
    .join("\n");
}

export type EmailLayoutInput = {
  siteName: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  orderSummary?: Array<{ label: string; value: string }> | null;
  supportEmail: string;
  supportWhatsapp: string;
  year: string | number;
  previewText?: string;
};

function ctaBlock(cta: { label: string; url: string }): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
    <tr>
      <td align="center" bgcolor="${COLORS.accent}" style="border-radius:10px;">
        <a href="${escapeEmailHtml(cta.url)}" target="_blank"
           style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${escapeEmailHtml(cta.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

function summaryBlock(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .filter((row) => row.value)
    .map(
      (row, index) => `
      <tr>
        <td style="padding:11px 16px;font-family:${FONT};font-size:13px;color:${COLORS.faint};${index ? `border-top:1px solid ${COLORS.border};` : ""}">${escapeEmailHtml(row.label)}</td>
        <td align="right" style="padding:11px 16px;font-family:${FONT};font-size:13px;font-weight:600;color:${COLORS.text};${index ? `border-top:1px solid ${COLORS.border};` : ""}">${escapeEmailHtml(row.value)}</td>
      </tr>`,
    )
    .join("");
  if (!body) return "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:4px 0 20px;background:${COLORS.panel};border:1px solid ${COLORS.borderStrong};border-radius:10px;">
    ${body}
  </table>`;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const preview = input.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(input.previewText)}</div>`
    : "";

  const cta = input.cta && input.cta.url ? ctaBlock(input.cta) : "";
  const summary =
    input.orderSummary && input.orderSummary.length ? summaryBlock(input.orderSummary) : "";

  const supportBits: string[] = [];
  if (input.supportEmail) {
    supportBits.push(
      `<a href="mailto:${escapeEmailHtml(input.supportEmail)}" style="color:${COLORS.link};text-decoration:none;">${escapeEmailHtml(input.supportEmail)}</a>`,
    );
  }
  if (input.supportWhatsapp) {
    supportBits.push(`WhatsApp ${escapeEmailHtml(input.supportWhatsapp)}`);
  }
  const supportLine = supportBits.length
    ? `Besoin d'aide&nbsp;? ${supportBits.join(" &middot; ")}`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeEmailHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};padding:32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:22px 32px;border-bottom:1px solid ${COLORS.border};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="display:inline-block;width:24px;height:24px;background:${COLORS.accent};border-radius:7px;"></span>
                </td>
                <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${COLORS.text};letter-spacing:-0.02em;">
                  ${escapeEmailHtml(input.siteName)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:30px 32px 8px;">
            <h1 style="margin:0 0 18px;font-family:${FONT};font-size:21px;line-height:28px;font-weight:700;color:${COLORS.text};">${escapeEmailHtml(input.title)}</h1>
            ${input.bodyHtml}
            ${summary}
            ${cta}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:22px 32px 26px;border-top:1px solid ${COLORS.border};">
            ${supportLine ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};">${supportLine}</p>` : ""}
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};">&copy; ${escapeEmailHtml(String(input.year))} ${escapeEmailHtml(input.siteName)}. Tous droits réservés.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
