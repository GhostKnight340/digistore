import "server-only";

import { prisma } from "@/lib/db/prisma";
import { publicOrderReference } from "@/lib/db/orders";
import type { DeliveredFieldDTO } from "@/lib/dto";
import { isDiscordEnabled } from "./config";
import { createDmChannel, postChannelMessage, DiscordApiError } from "./client";

/**
 * Discord DM order delivery. Additive convenience channel only — this module
 * NEVER changes whether an order is considered delivered, and follows the
 * never-throw contract: deliverOrderViaDiscord() resolves regardless of Discord
 * being disabled, misconfigured, or the DM failing.
 *
 * Sensitive redemption values are wrapped in Discord spoiler syntax so they are
 * blurred until clicked. Codes are never placed in embeds, logs, error
 * messages, or audit metadata.
 */

/** Wrap a sensitive value so Discord blurs it until the customer clicks. */
function spoiler(value: string): string {
  const trimmed = value.trim();
  // Prefer an inline-code span inside the spoiler for legibility, but fall back
  // to a bare spoiler if the value itself contains a backtick (which would
  // otherwise break out of the code span). Either way the value stays hidden.
  return trimmed.includes("`") ? `||${trimmed}||` : `||\`${trimmed}\`||`;
}

type DeliveryItem = {
  productName: string;
  faceLabel: string | null;
  fields: DeliveredFieldDTO[];
};

function buildDeliveryMessage(
  orderNumber: string,
  items: DeliveryItem[],
): string {
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
        lines.push(`**PIN :** ${spoiler(field.pin)}`);
      }
      if (field.url) {
        // A redemption URL is itself a sensitive secret — hide it too.
        lines.push(`**Lien de récupération :** ${spoiler(field.url)}`);
      }
      if (field.instructions) {
        // Instructions are not sensitive.
        lines.push(field.instructions);
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

/** Coarse, customer-safe failure category — never a raw Discord payload. */
function failureReason(error: unknown): string {
  if (error instanceof DiscordApiError) {
    // 403 = bot cannot DM the user (DMs closed / not sharing a server).
    if (error.status === 403) return "bot cannot message user";
    if (error.status === 404) return "Discord user unavailable";
    if (error.status === 429) return "temporary delivery failure";
    return "Discord API error";
  }
  return "temporary delivery failure";
}

/**
 * Attempts Discord DM delivery for a delivered order, then records the outcome
 * on the order and writes a code-free audit event. Safe to call as
 * `void deliverOrderViaDiscord(orderId)` from the fulfillment path.
 */
export async function deliverOrderViaDiscord(orderId: string): Promise<void> {
  if (!isDiscordEnabled()) return;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        discordDeliveryRequested: true,
        discordDeliveryStatus: true,
        customer: {
          select: { discordDmActivated: true, discordDmUserId: true },
        },
        deliveredCodes: {
          select: {
            manualCode: true,
            deliveryPayload: true,
            digitalCode: { select: { code: true } },
            product: { select: { name: true } },
            orderItem: {
              select: {
                variant: {
                  select: { faceValue: true, faceCurrency: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) return;
    // Guard rails — every condition must hold, mirroring spec §6/§13.
    if (order.status !== "delivered") return;
    if (!order.discordDeliveryRequested) return;
    if (order.discordDeliveryStatus === "SENT") return; // already delivered once
    const dmUserId = order.customer?.discordDmUserId;
    if (!order.customer?.discordDmActivated || !dmUserId) return;
    if (order.deliveredCodes.length === 0) return;

    const items: DeliveryItem[] = order.deliveredCodes.map((dc) => {
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

    const reference = await publicOrderReference(order);
    const content = buildDeliveryMessage(reference.number, items);

    const now = new Date();
    let outcomeStatus: "SENT" | "FAILED";
    let reason: string | null = null;
    try {
      const channel = await createDmChannel(dmUserId);
      await postChannelMessage(channel.id, { content });
      outcomeStatus = "SENT";
    } catch (error) {
      outcomeStatus = "FAILED";
      reason = failureReason(error);
      // Log the category only — never the code or raw payload.
      console.error(`[discord:dm-delivery] order ${orderId}: ${reason}`);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        discordDeliveryStatus: outcomeStatus,
        discordDeliveryAttemptedAt: now,
        ...(outcomeStatus === "SENT"
          ? { discordDeliverySentAt: now, discordDeliveryError: null }
          : { discordDeliveryError: reason }),
      },
    });

    await prisma.paymentEvent.create({
      data: {
        orderId,
        type: "discord_delivery",
        note:
          outcomeStatus === "SENT"
            ? "Livraison Discord envoyée."
            : `Échec de la livraison Discord : ${reason}.`,
      },
    });
  } catch (error) {
    // Absolute safety net: never let DM delivery affect the fulfilled order.
    console.error(
      "[discord:dm-delivery]",
      error instanceof Error ? error.message : "unexpected error",
    );
  }
}
