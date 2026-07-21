/**
 * Shared Discord delivery for the report-style AI modules (Daily Reports,
 * Supplier Intelligence, …).
 *
 * Reuses the low-level REST client and the AI-ops purpose→channel mapping.
 * Channel resolution precedence (most specific first):
 *   explicit override → module override → the purpose mapping → the
 *   AiOpsSettings default report channel.
 * On post failure the run's admin is notified on the alerts channel. Never
 * throws — every function returns a typed outcome.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import { isDiscordEnabled } from "@/lib/discord/config";
import { postChannelMessage, type DiscordMessagePayload } from "@/lib/discord/client";
import { listChannelMappings } from "../discordChannels";
import { getAiOpsSettings, getModuleConfig } from "../store";
import { isModuleKey, type ChannelPurpose } from "../types";

export interface ResolveChannelOptions {
  /** Highest precedence: an explicit channel id (e.g. a per-report override). */
  overrideChannelId?: string | null;
  /** The owning module — its `discordChannelId` override is consulted next. */
  moduleKey?: string;
  /** The purpose→channel mapping to consult after the module override. */
  purpose: ChannelPurpose;
}

/**
 * Resolves the channel an AI module posts to, honoring the override precedence.
 * Returns null when nothing is configured (the caller then records "no channel").
 */
export async function resolveAiChannel(opts: ResolveChannelOptions): Promise<string | null> {
  if (opts.overrideChannelId) return opts.overrideChannelId;
  if (opts.moduleKey && isModuleKey(opts.moduleKey)) {
    const config = await getModuleConfig(opts.moduleKey);
    if (config?.discordChannelId) return config.discordChannelId;
  }
  try {
    const mappings = await listChannelMappings();
    const mapped = mappings.find((m) => m.purpose === opts.purpose);
    if (mapped?.channelId) return mapped.channelId;
  } catch {
    // fall through to the settings default
  }
  const settings = await getAiOpsSettings();
  return settings.defaultReportChannelId ?? null;
}

export type PostResult = { ok: true; messageId: string } | { ok: false; error: string };

/** Posts a payload to a channel with ONE retry on transient failure. */
async function postWithRetry(channelId: string, payload: DiscordMessagePayload): Promise<PostResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await postChannelMessage(channelId, payload);
      return { ok: true, messageId: message.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "post_failed";
      if (attempt === 1) return { ok: false, error: msg };
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, error: "post_failed" };
}

/**
 * Resolves the channel and delivers the payload (retry once). Returns a typed
 * outcome; on failure the caller notifies the admin and records a failed run.
 */
export async function deliverToChannel(
  opts: ResolveChannelOptions,
  payload: DiscordMessagePayload,
  opLabel: string,
): Promise<PostResult> {
  if (!isDiscordEnabled()) return { ok: false, error: "discord_disabled" };
  const channelId = await resolveAiChannel(opts);
  if (!channelId) return { ok: false, error: "no_channel_configured" };
  const result = await postWithRetry(channelId, payload);
  if (!result.ok) {
    log.error("ai module post failed", { operation: `ai.${opLabel}.post`, result: "failed" });
  }
  return result;
}

/**
 * Notifies the admin that an AI module failed to post, on the alerts channel
 * ("alerts" mapping → AiOpsSettings.defaultAlertChannelId). Best-effort.
 */
export async function notifyAiFailure(label: string, reason: string, opLabel: string): Promise<void> {
  if (!isDiscordEnabled()) return;
  let alertChannel: string | null = null;
  try {
    const mappings = await listChannelMappings();
    alertChannel = mappings.find((m) => m.purpose === "alerts")?.channelId ?? null;
  } catch {
    // fall through
  }
  if (!alertChannel) {
    const settings = await getAiOpsSettings();
    alertChannel = settings.defaultAlertChannelId ?? null;
  }
  if (!alertChannel) return;
  try {
    await postChannelMessage(alertChannel, {
      embeds: [
        {
          title: "⚠️ AI report delivery failed",
          description: `${label} could not be posted.`,
          color: 0xe74c3c,
          fields: [{ name: "Reason", value: reason.slice(0, 200) || "unknown" }],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    log.error("ai module failure alert failed", {
      operation: `ai.${opLabel}.alert`,
      result: "failed",
      code: error instanceof Error ? error.name : "unknown",
    });
  }
}
