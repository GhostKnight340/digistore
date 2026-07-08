/**
 * Discord server structure shared by the setup script (which creates the
 * categories/channels) and the notification layer (which reads channel IDs
 * back out of env vars). Channel IDs are never hardcoded here — they live in
 * environment variables so no database model is needed for Discord config.
 */

export type DiscordChannelKey =
  | "ordersFeed"
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
      // One parent card message per order, with a thread per order holding
      // its full lifecycle timeline — see src/lib/discord/orderThread.ts.
      { key: "ordersFeed", name: "orders-feed", envVar: "DISCORD_CHANNEL_ORDERS_FEED_ID" },
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

/**
 * All the business channels are private by default: everyone in the server
 * is denied view access at the category and channel level, and only the
 * "Business manager" role (plus the bot and the configured owner) can see
 * them. Set up once by the setup script; not read at notification time.
 */
export const DISCORD_BUSINESS_MANAGER_ROLE = {
  name: "Business manager",
  envVar: "DISCORD_ROLE_BUSINESS_MANAGER_ID",
} as const;
