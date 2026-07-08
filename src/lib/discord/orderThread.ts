import "server-only";

import { prisma } from "@/lib/db/prisma";
import { formatMAD } from "@/lib/format";
import { isDiscordEnabled } from "./config";
import { getDiscordChannelId } from "./channels";
import {
  DiscordApiError,
  editChannelMessage,
  postChannelMessage,
  startThreadFromMessage,
  type DiscordMessagePayload,
} from "./client";

/**
 * #orders is a dashboard, not an event feed: one parent "card" message per
 * order (created here, edited in place as status changes) with a thread
 * attached to it holding every lifecycle event for that order. Never-throw
 * contract, same as notify.ts — callers never need to guard these calls.
 */

const COLOR = {
  blue: 0x3e7bfa,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  orange: 0xe67e22,
  red: 0xe74c3c,
  purple: 0x9b59b6,
  teal: 0x1abc9c,
  gray: 0x95a5a6,
} as const;

const STATUS_COLOR: Record<string, number> = {
  pending_payment: COLOR.gray,
  payment_submitted: COLOR.amber,
  payment_confirmed: COLOR.green,
  payment_issue: COLOR.orange,
  rejected: COLOR.red,
  refunded: COLOR.purple,
  cancelled: COLOR.gray,
  delivered: COLOR.green,
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pending payment",
  payment_submitted: "Payment submitted",
  payment_confirmed: "Payment confirmed",
  payment_issue: "Payment issue",
  rejected: "Payment rejected",
  refunded: "Refunded",
  cancelled: "Cancelled",
  delivered: "Delivered",
};

export type OrderCardData = {
  orderId: string;
  publicOrderNumber: string;
  status: string;
  totalMad: number;
  paymentMethod: string;
  bankName?: string | null;
  itemSummary?: string;
  adminUrl: string;
  discordMessageId: string | null;
  discordThreadId: string | null;
};

function cardPayload(data: OrderCardData): DiscordMessagePayload {
  const label = STATUS_LABEL[data.status] ?? data.status;
  return {
    embeds: [
      {
        title: `Order ${data.publicOrderNumber}`,
        color: STATUS_COLOR[data.status] ?? COLOR.gray,
        fields: [
          { name: "Status", value: label, inline: true },
          { name: "Total", value: formatMAD(data.totalMad), inline: true },
          { name: "Payment method", value: data.paymentMethod, inline: true },
          ...(data.bankName ? [{ name: "Bank", value: data.bankName, inline: true }] : []),
          ...(data.itemSummary ? [{ name: "Items", value: data.itemSummary }] : []),
          { name: "Admin", value: data.adminUrl },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof DiscordApiError && error.status === 404;
}

function logError(scope: string, error: unknown): void {
  console.error(`[discord:orderThread:${scope}]`, error instanceof Error ? error.message : error);
}

type ResolvedCard = { channelId: string; messageId: string; threadId: string };

/**
 * Ensures the order has a parent card message + thread, creating or
 * recovering whichever piece is missing, and persists any newly created ids.
 * Never throws; returns null only when Discord is disabled/misconfigured or
 * the create/recover calls themselves fail.
 */
async function ensureOrderCard(data: OrderCardData): Promise<ResolvedCard | null> {
  if (!isDiscordEnabled()) return null;
  const channelId = getDiscordChannelId("ordersFeed");
  if (!channelId) {
    console.error("[discord:orderThread] Missing ordersFeed channel id env var; skipping.");
    return null;
  }

  let messageId = data.discordMessageId;
  let threadId = data.discordThreadId;

  try {
    if (!messageId) {
      const message = await postChannelMessage(channelId, cardPayload(data));
      messageId = message.id;
      threadId = null; // a brand-new parent message never already has a thread
    }

    if (!threadId) {
      const thread = await startThreadFromMessage(
        channelId,
        messageId,
        `Order ${data.publicOrderNumber}`,
      );
      threadId = thread.id;
    }
  } catch (error) {
    logError("ensure", error);
    return null;
  }

  if (messageId !== data.discordMessageId || threadId !== data.discordThreadId) {
    try {
      await prisma.order.update({
        where: { id: data.orderId },
        data: { discordMessageId: messageId, discordThreadId: threadId },
      });
    } catch (error) {
      logError("persist", error);
    }
  }

  return { channelId, messageId, threadId };
}

/** Creates the order's parent card + thread on order creation. */
export async function createOrderCard(data: OrderCardData): Promise<void> {
  await ensureOrderCard(data);
}

/**
 * Posts a lifecycle-event message inside the order's thread and refreshes
 * the parent card's status/summary. Recovers a missing or deleted thread
 * (or, as a last resort, a deleted parent message) instead of ever posting
 * a new top-level message into #orders.
 */
export async function postOrderThreadEvent(
  data: OrderCardData,
  event: DiscordMessagePayload,
): Promise<void> {
  if (!isDiscordEnabled()) return;

  let card = await ensureOrderCard(data);
  if (!card) return;

  try {
    await postChannelMessage(card.threadId, event);
  } catch (error) {
    if (!isNotFound(error)) {
      logError("event", error);
    } else {
      // Thread was deleted/unreachable — recreate just the thread off the
      // existing parent message, then retry once. Do not touch the parent.
      const recovered = await ensureOrderCard({
        ...data,
        discordMessageId: card.messageId,
        discordThreadId: null,
      });
      if (recovered) {
        card = recovered;
        try {
          await postChannelMessage(card.threadId, event);
        } catch (retryError) {
          logError("event:retry", retryError);
        }
      }
    }
  }

  try {
    await editChannelMessage(card.channelId, card.messageId, cardPayload(data));
  } catch (error) {
    if (!isNotFound(error)) {
      logError("cardUpdate", error);
      return;
    }
    // Parent message itself is gone — only now do we rebuild the whole card
    // (new parent message + new thread), since editing it is no longer
    // possible and #orders must still end up with exactly one card.
    const recreated = await ensureOrderCard({
      ...data,
      discordMessageId: null,
      discordThreadId: null,
    });
    if (recreated) {
      try {
        await postChannelMessage(recreated.threadId, event);
      } catch (postError) {
        logError("recreate:event", postError);
      }
    }
  }
}
