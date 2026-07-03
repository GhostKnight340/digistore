import { absoluteAppUrl } from "./orderNumber";

/**
 * Variables available in email templates. `support_email`, `support_whatsapp`
 * and `current_year` are injected automatically by renderEmailTemplate from
 * the store settings, so they are listed for reference but never overridden
 * by the sample data.
 */
export const EMAIL_TEMPLATE_VARIABLE_KEYS = [
  "customer_name",
  "order_number",
  "total",
  "reason",
  "codes",
  "order_url",
  "payment_url",
  "delivery_url",
  "account_url",
  "verification_url",
  "reset_password_url",
  "support_email",
  "support_whatsapp",
  "current_year",
] as const;

/**
 * Realistic sample data used by both the admin preview and the admin test
 * email, so that the two always render through renderEmailTemplate with the
 * exact same inputs.
 */
export function emailTemplateSampleVariables(): Record<string, string> {
  return {
    customer_name: "Amine",
    order_number: "#000128",
    total: "250 MAD",
    reason: "Justificatif illisible, merci de renvoyer une photo nette du reçu.",
    codes: "GHST-7F2K-9QW1-MA45\nGHST-3B8N-X0RD-77TC",
    order_url: absoluteAppUrl("/order/000128"),
    payment_url: absoluteAppUrl("/payment/000128"),
    delivery_url: absoluteAppUrl("/delivery/000128"),
    account_url: absoluteAppUrl("/account"),
    verification_url: absoluteAppUrl("/verify-email?token=exemple"),
    reset_password_url: absoluteAppUrl("/reset-password?token=exemple"),
  };
}
