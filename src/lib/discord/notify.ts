import "server-only";

import { formatMAD } from "@/lib/format";
import { isDiscordEnabled } from "./config";
import { getDiscordChannelId, type DiscordChannelKey } from "./channels";
import {
  postChannelMessage,
  type DiscordEmbed,
  type DiscordMessagePayload,
} from "./client";

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

// ---------------------------------------------------------------------------
// #new-orders
// ---------------------------------------------------------------------------

export type NewOrderNotification = {
  orderId: string;
  publicOrderNumber: string;
  totalMad: number;
  paymentMethod: string;
  itemSummary: string;
  adminUrl: string;
  createdAt: string;
};

export function notifyOrderCreated(input: NewOrderNotification): Promise<void> {
  return safeSend("newOrders", () =>
    embed({
      title: `New order ${input.publicOrderNumber}`,
      color: COLOR.blue,
      fields: [
        { name: "Total", value: formatMAD(input.totalMad), inline: true },
        { name: "Payment method", value: input.paymentMethod, inline: true },
        { name: "Items", value: input.itemSummary },
        { name: "Admin", value: input.adminUrl },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// #payments
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_COLOR: Record<string, number> = {
  payment_submitted: COLOR.amber,
  payment_confirmed: COLOR.green,
  payment_issue: COLOR.orange,
  rejected: COLOR.red,
  refunded: COLOR.purple,
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  payment_submitted: "Payment submitted",
  payment_confirmed: "Payment confirmed",
  payment_issue: "Payment issue",
  rejected: "Payment rejected",
  refunded: "Refunded",
};

export type PaymentStatusNotification = {
  orderId: string;
  publicOrderNumber: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  adminUrl: string;
};

export function notifyPaymentStatusChange(
  input: PaymentStatusNotification,
): Promise<void> {
  const label = PAYMENT_STATUS_LABEL[input.toStatus] ?? input.toStatus;
  const transition = input.fromStatus
    ? `${input.fromStatus} → ${input.toStatus}`
    : input.toStatus;

  return safeSend("payments", () =>
    embed({
      title: `${label} — order ${input.publicOrderNumber}`,
      color: PAYMENT_STATUS_COLOR[input.toStatus] ?? COLOR.gray,
      fields: [
        { name: "Status", value: transition },
        ...(input.note ? [{ name: "Note", value: input.note }] : []),
        { name: "Admin", value: input.adminUrl },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// #fulfillment
// ---------------------------------------------------------------------------

export type FulfillmentNeededNotification = {
  orderId: string;
  publicOrderNumber: string;
  itemCount: number;
  adminUrl: string;
};

export function notifyFulfillmentNeeded(
  input: FulfillmentNeededNotification,
): Promise<void> {
  return safeSend("fulfillment", () =>
    embed({
      title: `Fulfillment needed — order ${input.publicOrderNumber}`,
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
  orderId: string;
  publicOrderNumber: string;
  adminUrl: string;
};

export function notifyFulfillmentCompleted(
  input: FulfillmentCompletedNotification,
): Promise<void> {
  return safeSend("fulfillment", () =>
    embed({
      title: `Delivered — order ${input.publicOrderNumber}`,
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
