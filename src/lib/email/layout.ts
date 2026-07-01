// ghost.ma transactional email system — faithful implementation of the Claude
// Design "Ghost Email System" (see design package: ghost-email-system-guide.md
// + PNG mockups). Four master templates share one shell (header, footer, type
// scale, buttons, spacing); only icon, title, message, CTA and status color
// change per message. Rebuilt as email-safe, table-based, inline-styled markup
// per the guide's build target — NOT a new design.
//
// Icons are the design's own SVGs rasterized to PNG (Gmail can't render SVG),
// hosted at /email-assets/ and referenced with absolute URLs.

const T = {
  canvas: "#09090B",
  surface: "#0C0C0F",
  card: "#131316",
  footer: "#08080A",
  border: "#1C1C20",
  borderStrong: "#2B2B30",
  text: "#F4F4F5",
  textBody: "#C9C9CE",
  muted: "#9A9AA3",
  faint: "#5E5E68",
  accent: "#3E7BFA",
  accentLight: "#5E92FF",
};

const FONT =
  "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

export type StatusKey = "info" | "success" | "warning" | "error";

const STATUS: Record<StatusKey, { solid: string; text: string }> = {
  info: { solid: "#3E7BFA", text: "#5E92FF" },
  success: { solid: "#3F9E78", text: "#6FC2A0" },
  warning: { solid: "#C99A4E", text: "#DDB36B" },
  error: { solid: "#C75D63", text: "#E0888D" },
};

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}
/** Composite an rgb color at `alpha` over a solid hex background. */
function over(hex: string, alpha: number, base: string): string {
  const c = hexToRgb(hex);
  const b = hexToRgb(base);
  return "#" + [0, 1, 2].map((i) => toHex(alpha * c[i] + (1 - alpha) * b[i])).join("");
}
function tintBg(s: StatusKey, base = T.surface): string {
  return over(STATUS[s].solid, 0.12, base);
}
function tintBorder(s: StatusKey, base = T.surface): string {
  return over(STATUS[s].solid, 0.26, base);
}

export function getEmailBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.EMAIL_BASE_URL || "https://ghost.ma";
  return raw.trim().replace(/\/+$/, "");
}

export function toAbsoluteUrl(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v.startsWith("/")) return `${getEmailBaseUrl()}${v}`;
  return `${getEmailBaseUrl()}/${v}`;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function icon(name: string): string {
  return `${getEmailBaseUrl()}/email-assets/${name}.png`;
}

export function renderParagraphs(text: string, color = T.textBody): string {
  const linkify = (escaped: string) =>
    escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => `<a href="${url}" style="color:${T.accentLight};text-decoration:underline;">${url}</a>`,
    );
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 15px;font-family:${FONT};font-size:15.5px;line-height:1.64;color:${color};">${linkify(escapeEmailHtml(p)).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

// ── Body blocks ──────────────────────────────────────────────────────────────

export type BodyBlock =
  | { kind: "infoBox"; label: string; rows: Array<{ label: string; value: string; mono?: boolean }> }
  | { kind: "reasonCard"; label: string; text: string; status: StatusKey }
  | { kind: "steps"; label: string; items: string[] }
  | { kind: "miniOrder"; orderNumber: string; total: string }
  | { kind: "orderSummary"; item: string; sub?: string; price?: string; rows: Array<{ label: string; value: string; accent?: boolean }>; total?: { label: string; value: string } }
  | { kind: "paymentCard"; label: string; rows: Array<{ label: string; value: string; mono?: boolean }> }
  | { kind: "timeline"; steps: Array<{ label: string; note?: string; state: "done" | "current" | "pending" }> }
  | { kind: "codeCard"; item: string; variant?: string; codes: string[]; url: string }
  | { kind: "supportCard"; title: string; text: string; url: string; linkLabel: string }
  | { kind: "closing"; status: StatusKey; iconName: string; html: string };

function pad(desktop = 40) {
  return `padding-left:${desktop}px;padding-right:${desktop}px`;
}

function monoLabel(text: string): string {
  return `<div style="font-family:${MONO};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${T.faint};">${escapeEmailHtml(text)}</div>`;
}

function card(inner: string, extra = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.card};border:1px solid ${T.border};border-radius:14px;${extra}"><tr><td style="padding:0;">${inner}</td></tr></table>`;
}

function keyValueRows(
  rows: Array<{ label: string; value: string; mono?: boolean; accent?: boolean }>,
): string {
  return rows
    .map(
      (r, i) => `<tr>
        <td style="padding:14px 18px;font-family:${FONT};font-size:14px;color:${T.muted};${i ? `border-top:1px solid ${T.border};` : ""}">${escapeEmailHtml(r.label)}</td>
        <td align="right" style="padding:14px 18px;font-family:${r.mono ? MONO : FONT};font-size:${r.mono ? "13px" : "14px"};font-weight:600;color:${r.accent ? T.accentLight : T.text};${i ? `border-top:1px solid ${T.border};` : ""}">${escapeEmailHtml(r.value)}</td>
      </tr>`,
    )
    .join("");
}

function iconTile(name: string, status: StatusKey, size = 56, radius = 15): string {
  const inner = Math.round(size * 0.46);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="${size}" height="${size}" style="width:${size}px;height:${size}px;background:${tintBg(status, T.surface)};border:1px solid ${tintBorder(status, T.surface)};border-radius:${radius}px;"><img src="${icon(name)}" width="${inner}" height="${inner}" alt="" style="display:block;border:0;" /></td></tr></table>`;
}

function primaryButton(label: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0;"><tr><td align="center" bgcolor="${T.accent}" style="border-radius:12px;box-shadow:0 8px 24px rgba(62,123,250,0.28);">
    <a href="${escapeEmailHtml(url)}" target="_blank" style="display:block;padding:15px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeEmailHtml(label)}</a>
  </td></tr></table>`;
}

function secondaryButton(label: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;"><tr><td align="center" style="border:1px solid ${T.borderStrong};border-radius:12px;">
    <a href="${escapeEmailHtml(url)}" target="_blank" style="display:block;padding:14px 24px;font-family:${FONT};font-size:14.5px;font-weight:600;line-height:20px;color:${T.text};text-decoration:none;border-radius:12px;">${escapeEmailHtml(label)}</a>
  </td></tr></table>`;
}

function timelineStep(
  step: { label: string; note?: string; state: "done" | "current" | "pending" },
  last: boolean,
): string {
  const dot =
    step.state === "done"
      ? `<td width="26" valign="top" style="width:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="24" height="24" style="width:24px;height:24px;background:${T.accent};border-radius:999px;"><img src="${icon("check-white")}" width="12" height="12" alt="" style="display:block;border:0;"/></td></tr></table></td>`
      : step.state === "current"
        ? `<td width="26" valign="top" style="width:26px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="24" height="24" style="width:24px;height:24px;background:${tintBg("info", T.card)};border:2px solid ${T.accent};border-radius:999px;"><span style="display:inline-block;width:8px;height:8px;background:${T.accent};border-radius:999px;"></span></td></tr></table></td>`
        : `<td width="26" valign="top" style="width:26px;"><span style="display:inline-block;width:22px;height:22px;border:2px solid ${T.borderStrong};border-radius:999px;"></span></td>`;
  const titleColor = step.state === "pending" ? T.faint : T.text;
  const noteColor = step.state === "current" ? T.accentLight : T.faint;
  return `<tr>${dot}
    <td valign="top" style="padding:0 0 ${last ? "0" : "18px"} 12px;">
      <div style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${titleColor};line-height:1.3;">${escapeEmailHtml(step.label)}</div>
      ${step.note ? `<div style="font-family:${FONT};font-size:12.5px;color:${noteColor};margin-top:3px;">${escapeEmailHtml(step.note)}</div>` : ""}
    </td></tr>`;
}

function renderBlock(block: BodyBlock): string {
  switch (block.kind) {
    case "infoBox":
      return `<div style="margin:0 0 24px;">${card(
        `<div style="padding:14px 18px;border-bottom:1px solid ${T.border};">${monoLabel(block.label)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${keyValueRows(block.rows)}</table>`,
      )}</div>`;
    case "reasonCard":
      return `<div style="margin:0 0 24px;">${card(
        `<div style="padding:14px 18px;border-bottom:1px solid ${tintBorder(block.status, T.card)};background:${tintBg(block.status, T.card)};border-radius:14px 14px 0 0;"><div style="font-family:${MONO};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${STATUS[block.status].text};">${escapeEmailHtml(block.label)}</div></div><div style="padding:16px 18px;font-family:${FONT};font-size:15px;line-height:1.55;color:${T.text};">${escapeEmailHtml(block.text)}</div>`,
      )}</div>`;
    case "steps":
      return `<div style="margin:0 0 24px;">${card(
        `<div style="padding:16px 18px 6px;">${monoLabel(block.label)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:0 6px 12px;">${block.items
          .map(
            (s, i) => `<tr>
              <td width="34" valign="top" style="padding:6px 0 6px 12px;font-family:${MONO};font-size:13px;font-weight:600;color:${T.accentLight};">${String(i + 1).padStart(2, "0")}</td>
              <td valign="top" style="padding:6px 12px 6px 4px;font-family:${FONT};font-size:14.5px;line-height:1.5;color:${T.textBody};">${escapeEmailHtml(s)}</td>
            </tr>`,
          )
          .join("")}</table>`,
      )}</div>`;
    case "miniOrder":
      return `<div style="margin:0 0 24px;">${card(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:16px 18px;"><div style="font-family:${FONT};font-size:12px;color:${T.muted};margin-bottom:4px;">Commande</div><div style="font-family:${MONO};font-size:14px;font-weight:600;color:${T.text};">#${escapeEmailHtml(block.orderNumber)}</div></td>
          <td align="right" style="padding:16px 18px;"><div style="font-family:${FONT};font-size:12px;color:${T.muted};margin-bottom:4px;">Montant</div><div style="font-family:${FONT};font-size:15px;font-weight:700;color:${T.text};">${escapeEmailHtml(block.total)}</div></td>
        </tr></table>`,
      )}</div>`;
    case "orderSummary": {
      const productRow = `<tr><td style="padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td valign="middle"><div style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${T.text};">${escapeEmailHtml(block.item)}</div>${block.sub ? `<div style="font-family:${FONT};font-size:12.5px;color:${T.muted};margin-top:2px;">${escapeEmailHtml(block.sub)}</div>` : ""}</td>
          ${block.price ? `<td align="right" valign="middle" style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${T.text};">${escapeEmailHtml(block.price)}</td>` : ""}
        </tr></table></td></tr>`;
      const sub = block.rows
        .map(
          (r) => `<tr><td style="padding:5px 18px;font-family:${FONT};font-size:13.5px;color:${T.muted};">${escapeEmailHtml(r.label)}</td><td align="right" style="padding:5px 18px;font-family:${FONT};font-size:13.5px;font-weight:600;color:${r.accent ? T.accentLight : T.textBody};">${escapeEmailHtml(r.value)}</td></tr>`,
        )
        .join("");
      const total = block.total
        ? `<tr><td style="padding:14px 18px 16px;border-top:1px solid ${T.border};font-family:${FONT};font-size:14px;color:${T.text};">${escapeEmailHtml(block.total.label)}</td><td align="right" style="padding:14px 18px 16px;border-top:1px solid ${T.border};font-family:${FONT};font-size:17px;font-weight:700;color:${T.text};">${escapeEmailHtml(block.total.value)}</td></tr>`
        : "";
      return `<div style="margin:0 0 24px;">${card(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${productRow}<tr><td colspan="2" style="border-top:1px solid ${T.border};padding:6px 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sub}</table></td></tr>${total}</table>`,
      )}</div>`;
    }
    case "paymentCard":
      return `<div style="margin:0 0 24px;">${card(
        `<div style="padding:14px 18px;border-bottom:1px solid ${T.border};">${monoLabel(block.label)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${keyValueRows(block.rows.map((r) => ({ ...r, accent: r.mono })))}</table>`,
      )}</div>`;
    case "timeline":
      return `<div style="margin:0 0 24px;">${card(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:18px;">${block.steps
          .map((s, i) => timelineStep(s, i === block.steps.length - 1))
          .join("")}</table>`,
      )}</div>`;
    case "codeCard": {
      const codesHtml = block.codes
        .map(
          (c) =>
            `<div style="font-family:${MONO};font-size:19px;font-weight:600;letter-spacing:0.02em;color:${T.text};padding:2px 0;">${escapeEmailHtml(c)}</div>`,
        )
        .join("");
      return `<div style="margin:0 0 20px;">${card(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 18px;">
            <div style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${T.text};">${escapeEmailHtml(block.item)}</div>
            ${block.variant ? `<div style="font-family:${FONT};font-size:12.5px;color:${T.muted};margin-top:2px;">${escapeEmailHtml(block.variant)}</div>` : ""}
          </td></tr>
          <tr><td style="padding:0 18px 18px;">
            <div style="font-family:${MONO};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${T.faint};margin-bottom:8px;">Votre code</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.surface};border:1px dashed ${tintBorder("success", T.card)};border-radius:12px;"><tr>
              <td style="padding:16px 18px;">${codesHtml}</td>
              <td align="right" valign="middle" style="padding:16px 18px;"><a href="${escapeEmailHtml(block.url)}" target="_blank" style="display:inline-block;padding:9px 16px;background:${T.accent};border-radius:9px;font-family:${FONT};font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">Copier</a></td>
            </tr></table>
          </td></tr></table>`,
        `border-color:${tintBorder("success", T.surface)};`,
      )}</div>`;
    }
    case "supportCard":
      return `<div style="margin:0 0 8px;">${card(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="56" valign="middle" style="padding:16px 0 16px 16px;">${iconTile("support-green", "success", 40, 11)}</td>
          <td valign="middle" style="padding:16px 12px;"><div style="font-family:${FONT};font-size:14px;font-weight:600;color:${T.text};">${escapeEmailHtml(block.title)}</div><div style="font-family:${FONT};font-size:13px;color:${T.muted};margin-top:2px;">${escapeEmailHtml(block.text)}</div></td>
          <td align="right" valign="middle" style="padding:16px 16px;"><a href="${escapeEmailHtml(block.url)}" target="_blank" style="font-family:${FONT};font-size:13.5px;font-weight:600;color:${T.accentLight};text-decoration:none;white-space:nowrap;">${escapeEmailHtml(block.linkLabel)} &rarr;</a></td>
        </tr></table>`,
      )}</div>`;
    case "closing":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;background:${tintBg(block.status, T.surface)};border:1px solid ${tintBorder(block.status, T.surface)};border-radius:12px;"><tr>
        <td width="44" valign="top" style="padding:14px 0 14px 16px;"><img src="${icon(block.iconName)}" width="20" height="20" alt="" style="display:block;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px 14px 4px;font-family:${FONT};font-size:13.5px;line-height:1.5;color:${T.textBody};">${block.html}</td>
      </tr></table>`;
  }
}

// ── Full document ────────────────────────────────────────────────────────────

export type EmailDoc = {
  title: string;
  contextLabel?: string;
  contextStatus?: StatusKey;
  banner?: { status: StatusKey; iconName: string; title: string; text: string };
  hero?: { iconName: string; status: StatusKey };
  badge?: { status: StatusKey; text: string };
  subtitle?: string;
  message?: string;
  blocks: BodyBlock[];
  primary?: { label: string; url: string };
  secondary?: { label: string; url: string };
  centered?: boolean;
  footerTagline: string;
  supportEmail: string;
  supportWhatsapp: string;
  year: string;
  siteName: string;
  previewText?: string;
};

function logo(size: "lg" | "sm" = "lg"): string {
  const fs = size === "lg" ? 19 : 17;
  return `<span style="font-family:${FONT};font-size:${fs}px;font-weight:600;letter-spacing:-0.03em;color:${T.text};">ghost<span style="color:${T.faint};">.ma</span></span>`;
}

function statusBadge(status: StatusKey, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${tintBg(status, T.surface)};border:1px solid ${tintBorder(status, T.surface)};border-radius:999px;"><tr><td style="padding:6px 13px;font-family:${FONT};font-size:12.5px;font-weight:600;color:${STATUS[status].text};"><span style="display:inline-block;width:6px;height:6px;background:${STATUS[status].solid};border-radius:999px;vertical-align:middle;margin-right:7px;"></span>${escapeEmailHtml(text)}</td></tr></table>`;
}

function socialCircle(inner: string): string {
  return `<td style="padding:0 5px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="34" height="34" style="width:34px;height:34px;background:${T.card};border:1px solid ${T.border};border-radius:999px;font-family:${FONT};font-size:13px;color:${T.muted};">${inner}</td></tr></table></td>`;
}

export function renderGhostEmail(doc: EmailDoc): string {
  const align = doc.centered ? "center" : "left";
  const preview = doc.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(doc.previewText)}</div>`
    : "";

  const banner = doc.banner
    ? `<tr><td style="background:${tintBg(doc.banner.status, T.surface)};border-bottom:1px solid ${tintBorder(doc.banner.status, T.surface)};${pad()};padding-top:18px;padding-bottom:18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:14px;"><img src="${icon(doc.banner.iconName)}" width="26" height="26" alt="" style="display:block;border:0;"/></td>
          <td valign="middle"><div style="font-family:${FONT};font-size:15px;font-weight:600;color:${STATUS[doc.banner.status].text};">${escapeEmailHtml(doc.banner.title)}</div><div style="font-family:${FONT};font-size:13px;color:${T.muted};margin-top:2px;">${escapeEmailHtml(doc.banner.text)}</div></td>
        </tr></table>
      </td></tr>`
    : "";

  const hero = doc.hero
    ? `<div style="margin:0 0 22px;${doc.centered ? "text-align:center;" : ""}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" ${doc.centered ? 'align="center"' : ""}><tr><td>${iconTile(doc.hero.iconName, doc.hero.status, doc.centered ? 64 : 56, doc.centered ? 18 : 15)}</td></tr></table></div>`
    : "";

  const badge = doc.badge
    ? `<div style="margin:0 0 16px;${doc.centered ? "text-align:center;" : ""}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" ${doc.centered ? 'align="center"' : ""}><tr><td>${statusBadge(doc.badge.status, doc.badge.text)}</td></tr></table></div>`
    : "";

  const titleHtml = `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:27px;line-height:1.18;letter-spacing:-0.032em;font-weight:600;color:${T.text};text-align:${align};">${escapeEmailHtml(doc.title)}</h1>`;
  const subtitleHtml = doc.subtitle
    ? `<p style="margin:0 0 22px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${T.muted};text-align:${align};">${escapeEmailHtml(doc.subtitle)}</p>`
    : "";
  const messageHtml = doc.message ? `<div style="margin:0 0 24px;">${renderParagraphs(doc.message)}</div>` : "";
  const blocksHtml = doc.blocks.map(renderBlock).join("");
  const primaryHtml = doc.primary ? `<div style="margin:26px 0 0;">${primaryButton(doc.primary.label, doc.primary.url)}</div>` : "";
  const secondaryHtml = doc.secondary ? secondaryButton(doc.secondary.label, doc.secondary.url) : "";

  const supportLine = [
    doc.supportEmail
      ? `<a href="mailto:${escapeEmailHtml(doc.supportEmail)}" style="color:${T.accentLight};text-decoration:none;">${escapeEmailHtml(doc.supportEmail)}</a>`
      : "",
    doc.supportWhatsapp ? `WhatsApp ${escapeEmailHtml(doc.supportWhatsapp)}` : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeEmailHtml(doc.title)}</title>
</head>
<body style="margin:0;padding:0;background:${T.canvas};">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.canvas};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${T.surface};border:1px solid ${T.border};border-radius:20px;overflow:hidden;">
      <!-- Header -->
      <tr><td style="${pad()};padding-top:24px;padding-bottom:24px;border-bottom:1px solid ${T.border};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">${logo("lg")}</td>
          <td align="right" valign="middle"><span style="font-family:${MONO};font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:${doc.contextStatus ? STATUS[doc.contextStatus].text : T.faint};">${escapeEmailHtml(doc.contextLabel ?? "")}</span></td>
        </tr></table>
      </td></tr>
      ${banner}
      <!-- Body -->
      <tr><td style="${pad()};padding-top:38px;padding-bottom:38px;">
        ${hero}${badge}${titleHtml}${subtitleHtml}${messageHtml}${blocksHtml}${primaryHtml}${secondaryHtml}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:${T.footer};${pad()};padding-top:30px;padding-bottom:30px;border-top:1px solid ${T.border};" align="center">
        <div style="margin-bottom:10px;">${logo("sm")}</div>
        <p style="margin:0 auto 16px;max-width:360px;font-family:${FONT};font-size:13px;line-height:1.6;color:${T.muted};">${escapeEmailHtml(doc.footerTagline)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>${socialCircle("X")}${socialCircle("IG")}${socialCircle("WA")}</tr></table>
        ${supportLine ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:${T.faint};">Besoin d'aide&nbsp;? ${supportLine}</p>` : ""}
        <p style="margin:0;font-family:${FONT};font-size:11.5px;color:${T.faint};">&copy; ${escapeEmailHtml(doc.year)} ghost.ma &middot; Conditions &middot; Confidentialité</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
