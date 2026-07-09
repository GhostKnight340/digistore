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

// --- OAuth (login / account linking) ---------------------------------------
// Client id is safe to expose; the secret must never leave the server.

export function getDiscordClientId(): string | undefined {
  return process.env.DISCORD_CLIENT_ID || undefined;
}

export function getDiscordClientSecret(): string | undefined {
  return process.env.DISCORD_CLIENT_SECRET || undefined;
}

/**
 * Discord application id — used only to build the "Open Discord" deep link to
 * the bot's DM. Safe to expose to the client. Falls back to the OAuth client id
 * (for Discord apps these are the same value).
 */
export function getDiscordApplicationId(): string | undefined {
  return (
    process.env.DISCORD_APPLICATION_ID ||
    process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID ||
    getDiscordClientId()
  );
}

// --- DM activation worker ---------------------------------------------------

/**
 * Shared secret used to HMAC-sign requests from the standalone DM worker to the
 * internal `/api/discord/activate` endpoint. Server-only; the worker holds the
 * same value out-of-band. When unset, the internal endpoint fails closed.
 */
export function getDiscordDmWorkerSecret(): string | undefined {
  return process.env.DISCORD_DM_WORKER_SECRET || undefined;
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
