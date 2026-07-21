/**
 * AI Operations Discord channel configuration (spec §6).
 *
 * Reuses the existing Discord bot + server. Never creates channels: an admin
 * picks EXISTING channels for each purpose, and we store the (stable) channel ID
 * plus a cached name for display. Multiple purposes may map to the same channel.
 * A connection test verifies the bot token and refreshes the cached names.
 *
 * The channel-ID validation is a pure function so it is unit-testable without
 * Discord or a DB.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getCurrentBotUser, listGuildChannels } from "@/lib/discord/client";
import { getDiscordGuildId, isDiscordEnabled } from "@/lib/discord/config";
import { isChannelPurpose, type ChannelPurpose } from "./types";

/**
 * A Discord snowflake: 17–20 digits. Pure — used to validate admin input before
 * we ever store or post to a channel. Empty string clears the mapping.
 */
export function isValidChannelId(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

export interface ChannelMappingDTO {
  purpose: ChannelPurpose;
  channelId: string;
  channelName: string | null;
}

export async function listChannelMappings(): Promise<ChannelMappingDTO[]> {
  const rows = await prisma.aiDiscordChannelMapping.findMany({ orderBy: { purpose: "asc" } });
  return rows
    .filter((r) => isChannelPurpose(r.purpose))
    .map((r) => ({ purpose: r.purpose as ChannelPurpose, channelId: r.channelId, channelName: r.channelName }));
}

export type SetChannelResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Sets (or clears, when channelId is empty) the channel for a purpose. Validates
 * the purpose and the channel-ID format before writing — never stores garbage.
 */
export async function setChannelMapping(
  purpose: string,
  channelId: string,
): Promise<SetChannelResult> {
  if (!isChannelPurpose(purpose)) return { ok: false, error: "Unknown channel purpose." };
  const trimmed = channelId.trim();
  if (trimmed === "") {
    await prisma.aiDiscordChannelMapping.deleteMany({ where: { purpose } });
    return { ok: true };
  }
  if (!isValidChannelId(trimmed)) {
    return { ok: false, error: "Invalid Discord channel ID (expected a 17–20 digit snowflake)." };
  }
  await prisma.aiDiscordChannelMapping.upsert({
    where: { purpose },
    update: { channelId: trimmed },
    create: { purpose, channelId: trimmed },
  });
  return { ok: true };
}

export interface ConnectionTestResult {
  ok: boolean;
  botUsername?: string;
  guildId?: string;
  channelCount?: number;
  error?: string;
}

/**
 * Verifies the Discord connection and refreshes cached channel names for every
 * stored mapping. Never throws — returns a typed result the admin UI renders.
 */
export async function testDiscordConnection(): Promise<ConnectionTestResult> {
  if (!isDiscordEnabled()) {
    return { ok: false, error: "Discord integration is disabled (check DISCORD_* env vars)." };
  }
  const guildId = getDiscordGuildId();
  if (!guildId) return { ok: false, error: "DISCORD_GUILD_ID is not configured." };
  try {
    const [bot, channels] = await Promise.all([getCurrentBotUser(), listGuildChannels(guildId)]);
    const nameById = new Map(channels.map((c) => [c.id, c.name]));
    // Refresh cached names for known mappings.
    const mappings = await prisma.aiDiscordChannelMapping.findMany();
    await Promise.all(
      mappings.map((m) =>
        prisma.aiDiscordChannelMapping.update({
          where: { id: m.id },
          data: { channelName: nameById.get(m.channelId) ?? m.channelName },
        }),
      ),
    );
    return {
      ok: true,
      botUsername: bot.username,
      guildId,
      channelCount: channels.length,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Connection test failed." };
  }
}

/**
 * Lists the guild's channels (id + name) for the admin picker. Returns [] when
 * Discord is disabled/unreachable rather than throwing.
 */
export async function listAvailableChannels(): Promise<{ id: string; name: string }[]> {
  if (!isDiscordEnabled()) return [];
  const guildId = getDiscordGuildId();
  if (!guildId) return [];
  try {
    const channels = await listGuildChannels(guildId);
    return channels.map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
  }
}
