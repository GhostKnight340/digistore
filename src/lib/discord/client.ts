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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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

export function postChannelMessage(
  channelId: string,
  payload: DiscordMessagePayload,
): Promise<unknown> {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: payload,
  });
}
