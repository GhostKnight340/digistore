import "server-only";

import { prisma } from "@/lib/db/prisma";
import { publicOrderReference } from "@/lib/db/orders";
import { urlHasSensitiveToken } from "@/lib/deliveryFields";
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

export type DiscordSendOutcome =
  | { ok: true; status: "SENT" }
  | { ok: false; status: "FAILED"; reason: string }
  | { ok: false; status: "SKIPPED"; reason: string };

/**
 * Core guarded DM send for a delivered order. Shared by automatic delivery
 * (`trigger:"auto"`, only when the customer requested it before fulfillment)
 * and the customer-triggered manual send (`trigger:"manual"`, which does not
 * require the pre-fulfillment request and permits a resend). Every other guard
 * — delivered status, DM activation, a verified DM user id, fulfillment data —
 * is enforced for both. Never throws; records SENT/FAILED status + a code-free
 * audit event and returns a typed outcome.
 */
export async function sendDeliveredOrderDm(
  orderId: string,
  { trigger }: { trigger: "auto" | "manual" },
): Promise<DiscordSendOutcome> {
  if (!isDiscordEnabled()) return { ok: false, status: "SKIPPED", reason: "disabled" };

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

    if (!order) return { ok: false, status: "SKIPPED", reason: "not_found" };
    // Guard rails — every condition must hold, mirroring spec §6/§12.
    if (order.status !== "delivered") return { ok: false, status: "SKIPPED", reason: "not_delivered" };
    // Automatic delivery only runs when the customer opted in and hasn't been
    // sent yet; a manual send skips those two gates (it IS the opt-in, and may
    // be an intentional resend).
    if (trigger === "auto") {
      if (!order.discordDeliveryRequested) return { ok: false, status: "SKIPPED", reason: "not_requested" };
      if (order.discordDeliveryStatus === "SENT") return { ok: false, status: "SKIPPED", reason: "already_sent" };
    }
    const dmUserId = order.customer?.discordDmUserId;
    if (!order.customer?.discordDmActivated || !dmUserId) {
      return { ok: false, status: "SKIPPED", reason: "not_activated" };
    }
    if (order.deliveredCodes.length === 0) return { ok: false, status: "SKIPPED", reason: "no_codes" };

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
    let outcome: DiscordSendOutcome;
    try {
      const channel = await createDmChannel(dmUserId);
      await postChannelMessage(channel.id, { content });
      outcome = { ok: true, status: "SENT" };
    } catch (error) {
      const reason = failureReason(error);
      // Log the category only — never the code or raw payload.
      console.error(`[discord:dm-delivery] order ${orderId}: ${reason}`);
      outcome = { ok: false, status: "FAILED", reason };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        discordDeliveryStatus: outcome.status,
        discordDeliveryAttemptedAt: now,
        ...(outcome.ok
          ? { discordDeliverySentAt: now, discordDeliveryError: null }
          : { discordDeliveryError: outcome.status === "FAILED" ? outcome.reason : null }),
      },
    });

    await prisma.paymentEvent.create({
      data: {
        orderId,
        type: "discord_delivery",
        note: outcome.ok
          ? `Livraison Discord envoyée${trigger === "manual" ? " (manuel)" : ""}.`
          : `Échec de la livraison Discord${trigger === "manual" ? " (manuel)" : ""} : ${
              outcome.status === "FAILED" ? outcome.reason : "ignorée"
            }.`,
      },
    });

    return outcome;
  } catch (error) {
    // Absolute safety net: never let DM delivery affect the fulfilled order.
    console.error(
      "[discord:dm-delivery]",
      error instanceof Error ? error.message : "unexpected error",
    );
    return { ok: false, status: "FAILED", reason: "temporary delivery failure" };
  }
}

/**
 * Automatic Discord DM delivery from the fulfillment path. Fire-and-forget:
 * `void deliverOrderViaDiscord(orderId)`. Only sends when the customer opted in
 * before fulfillment (see the `auto` guards in sendDeliveredOrderDm).
 */
export async function deliverOrderViaDiscord(orderId: string): Promise<void> {
  await sendDeliveredOrderDm(orderId, { trigger: "auto" });
}
