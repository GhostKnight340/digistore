import "server-only";

import { prisma } from "@/lib/db/prisma";
import { publicOrderReference } from "@/lib/db/orders";
import { isDiscordEnabled } from "./config";
import { createDmChannel, postChannelMessage, DiscordApiError } from "./client";
import { buildDeliveryItems, buildDeliveryMessage } from "./deliveryMessage";

/**
 * Discord DM order delivery. Additive convenience channel only — this module
 * NEVER changes whether an order is considered delivered, and follows the
 * never-throw contract: sendDeliveredOrderDm() resolves regardless of Discord
 * being disabled, misconfigured, or the DM failing.
 *
 * Automatic delivery on fulfillment was removed: order delivery over Discord is
 * now handled MANUALLY by an admin (the fulfillment page surfaces the customer's
 * Discord username and a ready-to-send message). Only the customer-triggered
 * "Envoyer aussi sur Discord" self-serve resend still sends via the bot here.
 *
 * The message composition lives in ./deliveryMessage (shared with the admin view
 * that builds the manual "ready to send" text). Codes are never placed in
 * embeds, logs, error messages, or audit metadata.
 */

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
        discordDeliveryPreferenceSet: true,
        discordDeliveryStatus: true,
        customer: {
          select: {
            discordDmActivated: true,
            discordDmUserId: true,
            discordOrderDeliveryEnabled: true,
          },
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
      // Explicit per-order choice wins; otherwise follow the customer's live
      // global preference (mirrors getOrderDiscordContextAction).
      const effectiveRequested = order.discordDeliveryPreferenceSet
        ? order.discordDeliveryRequested
        : (order.customer?.discordOrderDeliveryEnabled ?? false);
      if (!effectiveRequested) return { ok: false, status: "SKIPPED", reason: "not_requested" };
      if (order.discordDeliveryStatus === "SENT") return { ok: false, status: "SKIPPED", reason: "already_sent" };
    }
    const dmUserId = order.customer?.discordDmUserId;
    if (!order.customer?.discordDmActivated || !dmUserId) {
      return { ok: false, status: "SKIPPED", reason: "not_activated" };
    }
    if (order.deliveredCodes.length === 0) return { ok: false, status: "SKIPPED", reason: "no_codes" };

    const items = buildDeliveryItems(order.deliveredCodes);

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
 * Records that an admin manually delivered the order over Discord (copy-pasted
 * the ready-to-send message themselves). No bot send happens — this only stamps
 * the delivery status/date and appends a code-free audit event, so the order
 * page reflects that Discord delivery is done. Never throws.
 */
export async function markDiscordDeliveryManuallySent(
  orderId: string,
): Promise<{ ok: boolean }> {
  try {
    const now = new Date();
    await prisma.order.update({
      where: { id: orderId },
      data: {
        discordDeliveryStatus: "SENT",
        discordDeliveryAttemptedAt: now,
        discordDeliverySentAt: now,
        discordDeliveryError: null,
      },
    });
    await prisma.paymentEvent.create({
      data: {
        orderId,
        type: "discord_delivery",
        note: "Livraison Discord marquée comme envoyée manuellement (admin).",
      },
    });
    return { ok: true };
  } catch (error) {
    console.error(
      "[discord:dm-delivery] mark-manual failed:",
      error instanceof Error ? error.message : "unexpected error",
    );
    return { ok: false };
  }
}
