import "server-only";

import { formatMAD } from "@/lib/format";
import { isDiscordEnabled } from "./config";
import { getDiscordChannelId, type DiscordChannelKey } from "./channels";
import {
  postChannelMessage,
  type DiscordEmbed,
  type DiscordMessagePayload,
} from "./client";
import { createOrderCard, postOrderThreadEvent } from "./orderThread";
import { createSupportCard, postSupportThreadEvent, type SupportCardData } from "./supportThread";
import { getAdminPaymentMethods } from "@/lib/db/paymentMethods";
import { resolveOrderPaymentMethod } from "@/lib/paymentMethod";

/**
 * Orders store the payment-method *id* in `order.paymentMethod`; resolve it to
 * the customer-facing label (e.g. "CIH BANK") so the #orders card shows a name
 * instead of a raw id or a blank field. Never throws; falls back to the raw
 * value, then an em dash (Discord rejects empty embed field values).
 */
async function resolvePaymentMethodLabel(raw: string): Promise<string> {
  try {
    const { methods } = await getAdminPaymentMethods();
    const method = resolveOrderPaymentMethod(raw, methods);
    return method?.name || raw || "—";
  } catch {
    return raw || "—";
  }
}

/**
 * Never-throw contract: every exported function here resolves, never
 * rejects, regardless of Discord being disabled, misconfigured,
 * rate-limited, or unreachable. Business logic must be able to call these
 * and never wrap the call in its own try/catch for safety (though existing
 * call sites already do, matching the email-sending pattern).
 */
async function safeSend(
  channelKey: DiscordChannelKey,
  buildPayload: () => DiscordMessagePayload,
): Promise<void> {
  if (!isDiscordEnabled()) return;

  const channelId = getDiscordChannelId(channelKey);
  if (!channelId) {
    console.error(
      `[discord:notify] Missing ${channelKey} channel id env var; skipping notification.`,
    );
    return;
  }

  try {
    const payload = buildPayload();
    await postChannelMessage(channelId, payload);
  } catch (error) {
    console.error(
      `[discord:notify:${channelKey}]`,
      error instanceof Error ? error.message : error,
    );
  }
}

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

function embed(partial: DiscordEmbed): DiscordMessagePayload {
  return { embeds: [{ timestamp: new Date().toISOString(), ...partial }] };
}

/**
 * Posts an embed to the #ghost-expenses channel and RETURNS the outcome (unlike
 * the fire-and-forget safeSend) so the caller can persist an ExpenseNotificationLog
 * row (sent/failed + message id) and offer a retry. Never throws.
 */
export async function sendExpenseEmbed(
  partial: DiscordEmbed,
): Promise<{ ok: boolean; disabled?: boolean; messageId?: string; error?: string }> {
  if (!isDiscordEnabled()) return { ok: false, disabled: true, error: "Discord désactivé." };
  const channelId = getDiscordChannelId("expenses");
  if (!channelId) return { ok: false, error: "Canal dépenses non configuré (DISCORD_CHANNEL_EXPENSES_ID)." };
  try {
    const message = await postChannelMessage(channelId, embed(partial));
    return { ok: true, messageId: message.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[discord:notify:expenses]", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Like {@link sendExpenseEmbed} but posts a full message payload (embed +
 * optional link-button components), used by the end-of-month expense review.
 * Same never-throw + outcome-returning contract so the caller can persist the
 * sent/failed state and offer a retry.
 */
export async function sendExpenseMessage(
  payload: DiscordMessagePayload,
): Promise<{ ok: boolean; disabled?: boolean; messageId?: string; error?: string }> {
  if (!isDiscordEnabled()) return { ok: false, disabled: true, error: "Discord désactivé." };
  const channelId = getDiscordChannelId("expenses");
  if (!channelId) return { ok: false, error: "Canal dépenses non configuré (DISCORD_CHANNEL_EXPENSES_ID)." };
  try {
    const message = await postChannelMessage(channelId, {
      ...payload,
      embeds: payload.embeds?.map((e) => ({ timestamp: new Date().toISOString(), ...e })),
    });
    return { ok: true, messageId: message.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[discord:notify:expenses]", msg);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// #orders — one parent "card" per order (edited in place as status changes),
// each with a thread holding that order's full lifecycle timeline. See
// ./orderThread.ts for the create/recover/edit machinery.
// ---------------------------------------------------------------------------

/** The subset of an Order row every order-thread notification needs. */
export type OrderNotificationOrder = {
  id: string;
  status: string;
  totalMad: number;
  paymentMethod: string;
  discordMessageId: string | null;
  discordThreadId: string | null;
};

export type NewOrderNotification = {
  order: OrderNotificationOrder;
  publicOrderNumber: string;
  itemSummary: string;
  adminUrl: string;
};

export async function notifyOrderCreated(input: NewOrderNotification): Promise<void> {
  return createOrderCard({
    orderId: input.order.id,
    publicOrderNumber: input.publicOrderNumber,
    status: input.order.status,
    totalMad: input.order.totalMad,
    paymentMethod: await resolvePaymentMethodLabel(input.order.paymentMethod),
    itemSummary: input.itemSummary,
    adminUrl: input.adminUrl,
    discordMessageId: input.order.discordMessageId,
    discordThreadId: input.order.discordThreadId,
  });
}

const ORDER_STATUS_COLOR: Record<string, number> = {
  payment_submitted: COLOR.amber,
  payment_confirmed: COLOR.green,
  payment_issue: COLOR.orange,
  rejected: COLOR.red,
  refunded: COLOR.purple,
  cancelled: COLOR.gray,
  delivered: COLOR.green,
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  payment_submitted: "Payment submitted",
  payment_confirmed: "Payment confirmed",
  payment_issue: "Payment issue",
  rejected: "Payment rejected",
  refunded: "Refunded",
  cancelled: "Order cancelled",
  delivered: "Order delivered",
};

export type PaymentStatusNotification = {
  order: OrderNotificationOrder;
  publicOrderNumber: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  adminUrl: string;
};

export async function notifyPaymentStatusChange(
  input: PaymentStatusNotification,
): Promise<void> {
  const label = ORDER_STATUS_LABEL[input.toStatus] ?? input.toStatus;
  const transition = input.fromStatus
    ? `${input.fromStatus} → ${input.toStatus}`
    : input.toStatus;

  return postOrderThreadEvent(
    {
      orderId: input.order.id,
      publicOrderNumber: input.publicOrderNumber,
      status: input.toStatus,
      totalMad: input.order.totalMad,
      paymentMethod: await resolvePaymentMethodLabel(input.order.paymentMethod),
      adminUrl: input.adminUrl,
      discordMessageId: input.order.discordMessageId,
      discordThreadId: input.order.discordThreadId,
    },
    embed({
      title: label,
      color: ORDER_STATUS_COLOR[input.toStatus] ?? COLOR.gray,
      fields: [
        { name: "Status", value: transition },
        ...(input.note ? [{ name: "Note", value: input.note }] : []),
        { name: "Admin", value: input.adminUrl },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Fulfillment lifecycle — also posted into the order's thread, not a
// separate channel, so #orders' thread stays the single source of truth for
// that order's timeline.
// ---------------------------------------------------------------------------

export type FulfillmentNeededNotification = {
  order: OrderNotificationOrder;
  publicOrderNumber: string;
  itemCount: number;
  adminUrl: string;
};

export async function notifyFulfillmentNeeded(
  input: FulfillmentNeededNotification,
): Promise<void> {
  return postOrderThreadEvent(
    {
      orderId: input.order.id,
      publicOrderNumber: input.publicOrderNumber,
      status: "payment_confirmed",
      totalMad: input.order.totalMad,
      paymentMethod: await resolvePaymentMethodLabel(input.order.paymentMethod),
      adminUrl: input.adminUrl,
      discordMessageId: input.order.discordMessageId,
      discordThreadId: input.order.discordThreadId,
    },
    embed({
      title: "Fulfillment needed",
      description: "Payment confirmed. This order is waiting for code assignment.",
      color: COLOR.teal,
      fields: [
        { name: "Items to deliver", value: String(input.itemCount), inline: true },
        { name: "Admin", value: input.adminUrl },
      ],
    }),
  );
}

export type FulfillmentCompletedNotification = {
  order: OrderNotificationOrder;
  publicOrderNumber: string;
  adminUrl: string;
};

export async function notifyFulfillmentCompleted(
  input: FulfillmentCompletedNotification,
): Promise<void> {
  return postOrderThreadEvent(
    {
      orderId: input.order.id,
      publicOrderNumber: input.publicOrderNumber,
      status: "delivered",
      totalMad: input.order.totalMad,
      paymentMethod: await resolvePaymentMethodLabel(input.order.paymentMethod),
      adminUrl: input.adminUrl,
      discordMessageId: input.order.discordMessageId,
      discordThreadId: input.order.discordThreadId,
    },
    embed({
      title: "Delivered",
      description: "Codes have been assigned and the order is now delivered.",
      color: COLOR.green,
      fields: [{ name: "Admin", value: input.adminUrl }],
    }),
  );
}

// ---------------------------------------------------------------------------
// #accounts
// ---------------------------------------------------------------------------

export type AccountCreatedNotification = {
  customerId: string;
  name: string;
  email: string;
  createdAt: string;
};

export function notifyAccountCreated(
  input: AccountCreatedNotification,
): Promise<void> {
  return safeSend("accounts", () =>
    embed({
      title: "New account created",
      color: COLOR.blue,
      fields: [
        { name: "Name", value: input.name, inline: true },
        { name: "Email", value: input.email, inline: true },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// #support
// ---------------------------------------------------------------------------

/** Everything the #support card/thread needs, shared by the create/reply/close
 *  notifications. Mirrors the OrderCardData contract in orderThread.ts. */
export type SupportTicketCardInput = {
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

function toSupportCard(input: SupportTicketCardInput): SupportCardData {
  return {
    ticketId: input.ticketId,
    reference: input.reference,
    categoryLabel: input.categoryLabel,
    subIssueLabel: input.subIssueLabel,
    orderRef: input.orderRef,
    name: input.name,
    email: input.email,
    status: input.status,
    resolution: input.resolution,
    adminUrl: input.adminUrl,
    discordMessageId: input.discordMessageId,
    discordThreadId: input.discordThreadId,
  };
}

const SUPPORT_RESOLUTION_LABEL: Record<string, string> = {
  resolved: "Résolu",
  cancelled: "Annulé",
  dismissed: "Sans suite",
};

export type NewSupportTicketNotification = SupportTicketCardInput & {
  phone: string | null;
  message: string | null;
  attachmentCount: number;
};

/** Ticket submitted — create the #support card + thread and post the request. */
export function notifySupportTicketCreated(input: NewSupportTicketNotification): Promise<void> {
  return createSupportCard(
    toSupportCard(input),
    embed({
      title: "Nouvelle demande",
      color: COLOR.blue,
      fields: [
        { name: "Sujet", value: input.categoryLabel, inline: true },
        { name: "Problème", value: input.subIssueLabel, inline: true },
        ...(input.orderRef ? [{ name: "Commande", value: input.orderRef, inline: true }] : []),
        { name: "Client", value: input.name, inline: true },
        { name: "E-mail", value: input.email, inline: true },
        ...(input.phone ? [{ name: "Téléphone", value: input.phone, inline: true }] : []),
        ...(input.message ? [{ name: "Message", value: input.message.slice(0, 1000) }] : []),
        ...(input.attachmentCount > 0
          ? [{ name: "Pièces jointes", value: String(input.attachmentCount), inline: true }]
          : []),
      ],
    }),
  ).catch((error) => {
    console.error("[discord:notify:support:created]", error instanceof Error ? error.message : error);
  });
}

/** An admin reply was sent — record it in the ticket thread and update the card. */
export function notifySupportTicketReply(
  input: SupportTicketCardInput & { replyBody: string },
): Promise<void> {
  return postSupportThreadEvent(
    toSupportCard(input),
    embed({
      title: "Réponse envoyée",
      color: COLOR.teal,
      fields: [{ name: "Message", value: input.replyBody.slice(0, 1000) }],
    }),
  );
}

/** A customer replied from their account — record it in the ticket thread and
 *  refresh the card (the ticket returns to "open" for the team). */
export function notifySupportTicketCustomerReply(
  input: SupportTicketCardInput & { replyBody: string },
): Promise<void> {
  return postSupportThreadEvent(
    toSupportCard(input),
    embed({
      title: "Réponse du client",
      color: COLOR.amber,
      fields: [{ name: "Message", value: input.replyBody.slice(0, 1000) }],
    }),
  );
}

/** Status transition (closed / reopened) — record it and refresh the card so a
 *  closed ticket's thread clearly reads as closed. */
export function notifySupportTicketStatus(
  input: SupportTicketCardInput & { note?: string },
): Promise<void> {
  const closed = input.status === "closed";
  const title = closed
    ? `Demande clôturée${input.resolution ? ` — ${SUPPORT_RESOLUTION_LABEL[input.resolution] ?? input.resolution}` : ""}`
    : input.status === "open"
    ? "Demande rouverte"
    : "Statut mis à jour";
  return postSupportThreadEvent(
    toSupportCard(input),
    embed({
      title,
      color: closed ? (input.resolution === "resolved" || !input.resolution ? COLOR.green : COLOR.gray) : COLOR.blue,
      fields: input.note ? [{ name: "Note", value: input.note.slice(0, 1000) }] : undefined,
    }),
  );
}

/** The customer rated the support experience — post it into the ticket thread. */
export function notifySupportTicketFeedback(
  input: SupportTicketCardInput & { rating: number; comment: string | null },
): Promise<void> {
  const stars = "★".repeat(Math.max(0, Math.min(5, input.rating))).padEnd(5, "☆");
  return postSupportThreadEvent(
    toSupportCard(input),
    embed({
      title: "Avis client reçu",
      color: input.rating >= 4 ? COLOR.green : input.rating >= 3 ? COLOR.amber : COLOR.gray,
      fields: [
        { name: "Note", value: `${stars} (${input.rating}/5)`, inline: true },
        ...(input.comment ? [{ name: "Commentaire", value: input.comment.slice(0, 1000) }] : []),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// #stock-alerts
// ---------------------------------------------------------------------------

export type StockAlertNotification = {
  productName: string;
  variantName?: string;
  remaining: number;
  threshold: number;
  status: "low_stock" | "out_of_stock";
};

export function notifyStockAlert(input: StockAlertNotification): Promise<void> {
  const label = input.variantName
    ? `${input.productName} — ${input.variantName}`
    : input.productName;

  return safeSend("stockAlerts", () =>
    embed({
      title: input.status === "out_of_stock" ? "Out of stock" : "Low stock",
      description: label,
      color: input.status === "out_of_stock" ? COLOR.red : COLOR.orange,
      fields: [
        { name: "Remaining", value: String(input.remaining), inline: true },
        { name: "Threshold", value: String(input.threshold), inline: true },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// #system-alerts
// ---------------------------------------------------------------------------

export type SystemAlertNotification = {
  scope: string;
  message: string;
  context?: Record<string, string | number | boolean | null | undefined>;
};

export function notifySystemAlert(input: SystemAlertNotification): Promise<void> {
  const contextFields = Object.entries(input.context ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .slice(0, 10)
    .map(([name, value]) => ({ name, value: String(value), inline: true }));

  return safeSend("systemAlerts", () =>
    embed({
      title: `System alert: ${input.scope}`,
      description: input.message,
      color: COLOR.red,
      fields: contextFields,
    }),
  );
}

export function notifyEmailFailure(input: {
  templateKey: string;
  recipient: string;
  error: string;
  orderId?: string | null;
}): Promise<void> {
  return notifySystemAlert({
    scope: "email delivery",
    message: `Failed to send "${input.templateKey}" email.`,
    context: {
      recipient: input.recipient,
      orderId: input.orderId ?? undefined,
      error: input.error,
    },
  });
}

// ---------------------------------------------------------------------------
// #daily-summary — interface only, no scheduling wired up yet (Phase 2)
// ---------------------------------------------------------------------------

export type DailySummaryNotification = {
  periodLabel: string;
  newOrders: number;
  ordersDelivered: number;
  revenueMad: number;
  pendingFulfillment: number;
  lowStockCount: number;
};

export function notifyDailySummary(
  input: DailySummaryNotification,
): Promise<void> {
  return safeSend("dailySummary", () =>
    embed({
      title: `Daily summary — ${input.periodLabel}`,
      color: COLOR.blue,
      fields: [
        { name: "New orders", value: String(input.newOrders), inline: true },
        { name: "Delivered", value: String(input.ordersDelivered), inline: true },
        { name: "Revenue", value: formatMAD(input.revenueMad), inline: true },
        {
          name: "Pending fulfillment",
          value: String(input.pendingFulfillment),
          inline: true,
        },
        { name: "Low stock items", value: String(input.lowStockCount), inline: true },
      ],
    }),
  );
}
