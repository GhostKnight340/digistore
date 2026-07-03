import type { StoreSettings } from "./storeSettings";
import {
  renderEmailTemplate,
  type EmailTemplateKey,
  type RenderedEmailTemplate,
} from "./emailTemplates";

/**
 * Realistic sample values used to fill template variables in the admin preview
 * AND the "send test" email, so both match the branded layout customers get.
 * This is intentionally the single sample-data source shared by the client
 * preview and the server-side test send.
 */
export const emailPreviewSampleVariables: Record<string, string> = {
  customer_name: "Amine El Mansouri",
  order_number: "#000128",
  order_url: "https://ghost.ma/order/EXEMPLE",
  payment_url: "https://ghost.ma/payment/EXEMPLE",
  delivery_url: "https://ghost.ma/delivery/EXEMPLE",
  verification_url: "https://ghost.ma/verify-email?token=EXEMPLE-TOKEN",
  reset_password_url: "https://ghost.ma/reset-password?token=EXEMPLE-TOKEN",
  account_url: "https://ghost.ma/account",
  total: "250 MAD",
  order_total: "250 MAD",
  reason: "Justificatif de paiement illisible",
  support_email: "support@ghost.ma",
  support_whatsapp: "+212 600 000 000",
  codes: "GHOST-AAAA-BBBB-CCCC\nGHOST-DDDD-EEEE-FFFF",
};

export type EmailTemplateDraft = { subject: string; body: string };

/**
 * Renders the FULL branded email (background, header/logo, title, body, CTA,
 * summary cards, footer, support links, social icons, payment badges) exactly
 * as a customer receives it, using {@link renderEmailTemplate} — the same
 * renderer that produces real outgoing emails.
 *
 * When `override` is provided (unsaved editor draft), it is merged into the
 * settings before rendering so the preview and test send reflect live edits.
 */
export function renderEmailPreview(
  settings: StoreSettings,
  key: EmailTemplateKey,
  override?: EmailTemplateDraft,
): RenderedEmailTemplate {
  const effectiveSettings = override
    ? {
        ...settings,
        emailTemplates: { ...settings.emailTemplates, [key]: override },
      }
    : settings;
  return renderEmailTemplate(effectiveSettings, key, emailPreviewSampleVariables);
}
