/**
 * Minimal Discord REST client (v10, bot token auth). This is the ONLY module
 * allowed to read the bot token and the ONLY module allowed to build the
 * `Authorization` header. Nothing here may log that header or the token.
 *
 * Phase 1 is REST-only: no gateway connection, no discord.js. That's enough
 * for posting notifications and running the one-time setup script.
 */
import { getDiscordBotToken } from "./config";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_RATE_LIMIT_RETRIES = 1;

export class DiscordApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
  }
}

export const DISCORD_CHANNEL_TYPE = {
  GUILD_TEXT: 0,
  GUILD_CATEGORY: 4,
} as const;

type DiscordRequestInit = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

async function discordRequest<T>(
  path: string,
  init: DiscordRequestInit = {},
  attempt = 0,
): Promise<T> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new DiscordApiError("DISCORD_BOT_TOKEN is not configured.", 401);
  }

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    const retryAfterSeconds = await readRetryAfter(response);
    await sleep(retryAfterSeconds * 1000);
    return discordRequest<T>(path, init, attempt + 1);
  }

  if (!response.ok) {
    const detail = await safeReadErrorDetail(response);
    throw new DiscordApiError(
      `Discord API ${init.method ?? "GET"} ${path} failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readRetryAfter(response: Response): Promise<number> {
  try {
    const data = (await response.clone().json()) as { retry_after?: number };
    if (typeof data.retry_after === "number") return data.retry_after;
  } catch {
    // fall through to header lookup
  }
  const header = response.headers.get("Retry-After");
  const parsed = header ? Number(header) : NaN;
  return Number.isFinite(parsed) ? parsed : 1;
}

async function safeReadErrorDetail(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
};

export function listGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  return discordRequest<DiscordChannel[]>(`/guilds/${guildId}/channels`);
}

export function createGuildCategory(guildId: string, name: string): Promise<DiscordChannel> {
  return discordRequest<DiscordChannel>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: { name, type: DISCORD_CHANNEL_TYPE.GUILD_CATEGORY },
  });
}

export function createGuildTextChannel(
  guildId: string,
  name: string,
  parentId: string,
): Promise<DiscordChannel> {
  return discordRequest<DiscordChannel>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: { name, type: DISCORD_CHANNEL_TYPE.GUILD_TEXT, parent_id: parentId },
  });
}

// ---------------------------------------------------------------------------
// Roles + channel permission overwrites — used only by the setup script to
// restrict the business channels to a "Business manager" role (plus the bot
// itself, so it can keep posting). Never used at notification time.
// ---------------------------------------------------------------------------

// Plain numbers (not BigInt) — every bit used here is well under 2^31, so
// regular JS bitwise ops are exact. Discord's API accepts the decimal string
// form of the bitfield either way.
export const DISCORD_PERMISSION = {
  VIEW_CHANNEL: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  READ_MESSAGE_HISTORY: 1 << 16,
} as const;

export const DISCORD_OVERWRITE_TYPE = {
  ROLE: 0,
  MEMBER: 1,
} as const;

export type DiscordRole = {
  id: string;
  name: string;
  permissions: string;
  position: number;
};

export function listGuildRoles(guildId: string): Promise<DiscordRole[]> {
  return discordRequest<DiscordRole[]>(`/guilds/${guildId}/roles`);
}

export function createGuildRole(
  guildId: string,
  name: string,
): Promise<DiscordRole> {
  return discordRequest<DiscordRole>(`/guilds/${guildId}/roles`, {
    method: "POST",
    body: { name, permissions: "0", hoist: true, mentionable: true },
  });
}

export function reorderGuildRoles(
  guildId: string,
  positions: { id: string; position: number }[],
): Promise<DiscordRole[]> {
  return discordRequest<DiscordRole[]>(`/guilds/${guildId}/roles`, {
    method: "PATCH",
    body: positions,
  });
}

export type DiscordGuildMember = {
  roles: string[];
};

export function getGuildMember(
  guildId: string,
  userId: string,
): Promise<DiscordGuildMember> {
  return discordRequest<DiscordGuildMember>(`/guilds/${guildId}/members/${userId}`);
}

export type DiscordPermissionOverwrite = {
  id: string;
  type: (typeof DISCORD_OVERWRITE_TYPE)[keyof typeof DISCORD_OVERWRITE_TYPE];
  allow: number;
  deny: number;
};

export async function setChannelPermissionOverwrite(
  channelId: string,
  overwrite: DiscordPermissionOverwrite,
): Promise<void> {
  await discordRequest(`/channels/${channelId}/permissions/${overwrite.id}`, {
    method: "PUT",
    body: {
      type: overwrite.type,
      allow: overwrite.allow.toString(),
      deny: overwrite.deny.toString(),
    },
  });
}

export type DiscordUser = {
  id: string;
  username: string;
  bot?: boolean;
};

export function getCurrentBotUser(): Promise<DiscordUser> {
  return discordRequest<DiscordUser>("/users/@me");
}

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
};

export type DiscordMessagePayload = {
  content?: string;
  embeds?: DiscordEmbed[];
};

export type DiscordMessage = {
  id: string;
  channel_id: string;
};

export function postChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload,
): Promise<DiscordMessage> {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: payload,
  });
}

/**
 * Opens (or returns the existing) DM channel with a user. Requires the user to
 * have DM'd the bot before or share a guild — always true here because DM
 * delivery is gated on the customer having sent an activation code to the bot.
 */
export function createDmChannel(recipientId: string): Promise<DiscordChannel> {
  return discordRequest<DiscordChannel>("/users/@me/channels", {
    method: "POST",
    body: { recipient_id: recipientId },
  });
}

export function editChannelMessage(
  channelId: string,
  messageId: string,
  payload: DiscordMessagePayload,
): Promise<DiscordMessage> {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: payload,
  });
}

export type DiscordThread = {
  id: string;
};

// Threads are just channels for messaging purposes — postChannelMessage /
// editChannelMessage both work unchanged against a thread id.
const THREAD_AUTO_ARCHIVE_MINUTES = 10080; // 7 days, Discord's max

export function startThreadFromMessage(
  channelId: string,
  messageId: string,
  name: string,
): Promise<DiscordThread> {
  return discordRequest<DiscordThread>(
    `/channels/${channelId}/messages/${messageId}/threads`,
    {
      method: "POST",
      body: { name: name.slice(0, 100), auto_archive_duration: THREAD_AUTO_ARCHIVE_MINUTES },
    },
  );
}
