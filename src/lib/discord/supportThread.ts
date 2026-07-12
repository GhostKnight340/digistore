import "server-only";

import { persistSupportDiscordIds } from "@/lib/db/supportTickets";
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
 * #support is a dashboard, not an event feed — the same pattern as #orders:
 * one parent "card" message per ticket (created here, edited in place as the
 * status changes) with a thread attached to it holding the full conversation
 * (customer message → admin replies → close). Never-throw contract, matching
 * notify.ts / orderThread.ts: callers never need to guard these calls.
 */

const COLOR = {
  blue: 0x3e7bfa,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  teal: 0x1abc9c,
  gray: 0x95a5a6,
} as const;

const RESOLUTION_LABEL: Record<string, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

function statusLabel(status: string, resolution: string | null): string {
  if (status === "closed") {
    const suffix = resolution ? ` — ${RESOLUTION_LABEL[resolution] ?? resolution}` : "";
    return `Fermée${suffix}`;
  }
  if (status === "answered") return "Répondue";
  return "Ouverte";
}

function statusColor(status: string, resolution: string | null): number {
  if (status === "closed") return resolution === "resolved" || !resolution ? COLOR.green : COLOR.gray;
  if (status === "answered") return COLOR.teal;
  return COLOR.blue;
}

export type SupportCardData = {
  ticketId: string;
  reference: string;
  categoryLabel: string;
  subIssueLabel: string;
  orderRef: string | null;
  name: string;
  email: string;
  status: string;
  resolution: string | null;
  adminUrl: string;
  discordMessageId: string | null;
  discordThreadId: string | null;
};

function cardPayload(data: SupportCardData): DiscordMessagePayload {
  return {
    embeds: [
      {
        title: `🎫 Support ${data.reference}`,
        color: statusColor(data.status, data.resolution),
        fields: [
          { name: "Statut", value: statusLabel(data.status, data.resolution), inline: true },
          { name: "Sujet", value: data.categoryLabel, inline: true },
          { name: "Problème", value: data.subIssueLabel, inline: true },
          { name: "Client", value: data.name, inline: true },
          { name: "E-mail", value: data.email, inline: true },
          ...(data.orderRef ? [{ name: "Commande", value: data.orderRef, inline: true }] : []),
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
  console.error(`[discord:supportThread:${scope}]`, error instanceof Error ? error.message : error);
}

type ResolvedCard = { channelId: string; messageId: string; threadId: string };

/**
 * Ensures the ticket has a parent card message + thread, creating or recovering
 * whichever piece is missing, and persists any newly created ids. Never throws;
 * returns null when Discord is disabled/misconfigured or a create call fails.
 */
async function ensureSupportCard(data: SupportCardData): Promise<ResolvedCard | null> {
  if (!isDiscordEnabled()) return null;
  const channelId = getDiscordChannelId("support");
  if (!channelId) {
    console.error("[discord:supportThread] Missing support channel id env var; skipping.");
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
      const thread = await startThreadFromMessage(channelId, messageId, `Support ${data.reference}`);
      threadId = thread.id;
    }
  } catch (error) {
    logError("ensure", error);
    return null;
  }

  if (messageId !== data.discordMessageId || threadId !== data.discordThreadId) {
    try {
      await persistSupportDiscordIds(data.ticketId, messageId, threadId);
    } catch (error) {
      logError("persist", error);
    }
  }

  return { channelId, messageId, threadId };
}

/** Creates the ticket's parent card + thread on submission and posts the first
 *  message (the customer's request) into the thread. */
export async function createSupportCard(
  data: SupportCardData,
  firstMessage: DiscordMessagePayload,
): Promise<void> {
  const card = await ensureSupportCard(data);
  if (!card) return;
  try {
    await postChannelMessage(card.threadId, firstMessage);
  } catch (error) {
    logError("firstMessage", error);
  }
}

/**
 * Posts an event message inside the ticket's thread and refreshes the parent
 * card's status. Recovers a missing thread (or, as a last resort, a deleted
 * parent) instead of ever posting a new top-level message into #support.
 */
export async function postSupportThreadEvent(
  data: SupportCardData,
  event: DiscordMessagePayload,
): Promise<void> {
  if (!isDiscordEnabled()) return;

  let card = await ensureSupportCard(data);
  if (!card) return;

  try {
    await postChannelMessage(card.threadId, event);
  } catch (error) {
    if (!isNotFound(error)) {
      logError("event", error);
    } else {
      const recovered = await ensureSupportCard({
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
    const recreated = await ensureSupportCard({
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
