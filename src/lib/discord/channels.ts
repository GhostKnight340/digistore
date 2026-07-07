/**
 * Discord server structure shared by the setup script (which creates the
 * categories/channels) and the notification layer (which reads channel IDs
 * back out of env vars). Channel IDs are never hardcoded here — they live in
 * environment variables so no database model is needed for Discord config.
 */

export type DiscordChannelKey =
  | "ordersFeed"
  | "fulfillment"
  | "accounts"
  | "support"
  | "stockAlerts"
  | "systemAlerts"
  | "dailySummary";

export type DiscordChannelDefinition = {
  key: DiscordChannelKey;
  name: string;
  envVar: string;
};

export type DiscordCategoryDefinition = {
  name: string;
  channels: DiscordChannelDefinition[];
};

export const DISCORD_SERVER_STRUCTURE: DiscordCategoryDefinition[] = [
  {
    name: "📦 ORDERS",
    channels: [
      { key: "ordersFeed", name: "orders-feed", envVar: "DISCORD_CHANNEL_ORDERS_FEED_ID" },
      { key: "fulfillment", name: "fulfillment", envVar: "DISCORD_CHANNEL_FULFILLMENT_ID" },
    ],
  },
  {
    name: "👥 CUSTOMERS",
    channels: [
      { key: "accounts", name: "accounts", envVar: "DISCORD_CHANNEL_ACCOUNTS_ID" },
      { key: "support", name: "support", envVar: "DISCORD_CHANNEL_SUPPORT_ID" },
    ],
  },
  {
    name: "⚙️ OPERATIONS",
    channels: [
      { key: "stockAlerts", name: "stock-alerts", envVar: "DISCORD_CHANNEL_STOCK_ALERTS_ID" },
      { key: "systemAlerts", name: "system-alerts", envVar: "DISCORD_CHANNEL_SYSTEM_ALERTS_ID" },
      { key: "dailySummary", name: "daily-summary", envVar: "DISCORD_CHANNEL_DAILY_SUMMARY_ID" },
    ],
  },
];

export function allDiscordChannelDefinitions(): DiscordChannelDefinition[] {
  return DISCORD_SERVER_STRUCTURE.flatMap((category) => category.channels);
}

export function getDiscordChannelId(key: DiscordChannelKey): string | undefined {
  const def = allDiscordChannelDefinitions().find((channel) => channel.key === key);
  if (!def) return undefined;
  return process.env[def.envVar] || undefined;
}
