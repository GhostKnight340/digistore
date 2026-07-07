/**
 * Central reader for Discord-related environment variables. No other module
 * should read `process.env.DISCORD_*` directly — go through these accessors
 * so token/enablement logic stays in one place.
 */

export function getDiscordBotToken(): string | undefined {
  return process.env.DISCORD_BOT_TOKEN || undefined;
}

export function getDiscordGuildId(): string | undefined {
  return process.env.DISCORD_GUILD_ID || undefined;
}

export function getDiscordOwnerUserId(): string | undefined {
  return process.env.DISCORD_OWNER_USER_ID || undefined;
}

/**
 * Fails closed: integration only counts as enabled when the flag is
 * explicitly "true" AND the token/guild required to act on it are present.
 */
export function isDiscordEnabled(): boolean {
  return (
    process.env.DISCORD_INTEGRATION_ENABLED === "true" &&
    Boolean(getDiscordBotToken()) &&
    Boolean(getDiscordGuildId())
  );
}
