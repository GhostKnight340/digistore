import { urlHasSensitiveToken } from "@/lib/deliveryFields";
import type { DeliveredFieldDTO } from "@/lib/dto";

/**
 * Composition of the Discord order-delivery message. Kept in its own module (no
 * DB, no `@/lib/db/orders` import) so BOTH the DM sender (src/lib/discord/dm.ts)
 * and the admin order view (src/lib/db/orders.ts, which builds the "ready to
 * send" text for manual delivery) can reuse it without an import cycle.
 *
 * Sensitive redemption values are wrapped in Discord spoiler syntax so they are
 * blurred until clicked.
 */

/** Wrap a sensitive value so Discord blurs it until the customer clicks. */
function spoiler(value: string): string {
  const trimmed = value.trim();
  // Prefer an inline-code span inside the spoiler for legibility, but fall back
  // to a bare spoiler if the value itself contains a backtick (which would
  // otherwise break out of the code span). Either way the value stays hidden.
  return trimmed.includes("`") ? `||${trimmed}||` : `||\`${trimmed}\`||`;
}

export interface DeliveryItem {
  productName: string;
  faceLabel: string | null;
  fields: DeliveredFieldDTO[];
}

/** The delivered-code row shape both callers select from Prisma. */
export interface DeliveredCodeRow {
  manualCode: string | null;
  deliveryPayload: unknown;
  digitalCode: { code: string } | null;
  product: { name: string } | null;
  orderItem: {
    variant: { faceValue: number | null; faceCurrency: string | null; name: string | null } | null;
  } | null;
}

/** Map raw delivered-code rows into the display items used by the message. */
export function buildDeliveryItems(codes: DeliveredCodeRow[]): DeliveryItem[] {
  return codes.map((dc) => {
    const payloadFields = Array.isArray(dc.deliveryPayload)
      ? (dc.deliveryPayload as unknown as DeliveredFieldDTO[])
      : null;
    const fields: DeliveredFieldDTO[] =
      payloadFields && payloadFields.length > 0
        ? payloadFields
        : [{ code: dc.digitalCode?.code ?? dc.manualCode ?? "" }];
    const variant = dc.orderItem?.variant;
    const faceLabel =
      variant && variant.faceValue != null
        ? `${variant.faceValue} ${variant.faceCurrency}`
        : null;
    return {
      productName: dc.product?.name ?? "Produit",
      faceLabel,
      fields: fields.filter((f) => f.code || f.pin || f.url || f.instructions),
    };
  });
}

/** Build the full French delivery message for a delivered order. Pure. */
export function buildDeliveryMessage(orderNumber: string, items: DeliveryItem[]): string {
  const lines: string[] = [
    "🎮 **Votre commande Ghost.ma est prête !**",
    "",
    `**Commande :** #${orderNumber}`,
    "",
  ];

  for (const item of items) {
    lines.push(`**Produit :** ${item.productName}`);
    if (item.faceLabel) lines.push(`**Valeur :** ${item.faceLabel}`);
    for (const field of item.fields) {
      if (field.code) {
        lines.push("**Votre code :**", spoiler(field.code));
      }
      if (field.pin) {
        lines.push("**PIN :**", spoiler(field.pin));
      }
      if (field.url) {
        // A normal public redemption URL is NOT a secret — send it plainly.
        // Only spoiler-wrap a URL that embeds a sensitive one-time token.
        lines.push(
          "**Lien d’utilisation :**",
          urlHasSensitiveToken(field.url) ? spoiler(field.url) : field.url,
        );
      }
      if (field.instructions) {
        // Instructions are not sensitive.
        lines.push("**Instructions :**", field.instructions);
      }
    }
    lines.push("");
  }

  lines.push(
    "Cliquez sur le code masqué pour l’afficher.",
    "",
    "Merci pour votre commande 💙",
  );
  return lines.join("\n");
}
