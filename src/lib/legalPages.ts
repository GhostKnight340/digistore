import type { StoreSettings } from "./storeSettings";

export function renderLegalContent(
  content: string,
  settings: StoreSettings,
): string {
  return content
    .replaceAll("{{support_email}}", settings.footer.contactEmail)
    .replaceAll("{{support_whatsapp}}", settings.footer.whatsappNumber)
    .replaceAll("{{business_name}}", settings.branding.siteName)
    .replaceAll("{{business_address}}", "[adresse de l'entreprise]")
    .replaceAll("{{business_register}}", "[registre de commerce]")
    .replaceAll("{{business_tax_id}}", "[identifiant fiscal]");
}

export function legalParagraphs(content: string): string[] {
  return content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}
