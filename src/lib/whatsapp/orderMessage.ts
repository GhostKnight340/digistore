/**
 * Pure builder for the WhatsApp order message. No DB and no server-only imports
 * (mirrors src/lib/discord/deliveryMessage.ts) so BOTH the admin order view —
 * which today offers a manual copy / wa.me deep link — and a future automatic
 * WhatsApp sender can reuse it without an import cycle.
 *
 * The message deliberately carries a LINK to the order rather than the codes
 * themselves: the customer opens their order page to collect the delivery.
 */
/**
 * Normalize a (possibly local) customer phone into an international wa.me
 * recipient — digits only, no `+`. Moroccan storefront: a leading 0 is a local
 * number, so it is rewritten with the default country code (212); a `00` prefix
 * is the international-access form and is dropped. Returns "" when there aren't
 * enough digits to be a real number.
 */
export function toWhatsappNumber(phone: string, defaultCountryCode = "212"): string {
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  return digits.length >= 9 ? digits : "";
}

export function buildWhatsappOrderMessage(input: {
  orderNumber: string;
  customerName: string;
  orderUrl: string;
}): string {
  const name = input.customerName.trim();
  const greeting = name ? `Bonjour ${name} 👋` : "Bonjour 👋";
  return [
    greeting,
    "",
    `Voici le suivi de votre commande Ghost.ma #${input.orderNumber}.`,
    "Consultez et récupérez votre commande ici :",
    input.orderUrl,
    "",
    "Merci pour votre confiance 💙",
  ].join("\n");
}
