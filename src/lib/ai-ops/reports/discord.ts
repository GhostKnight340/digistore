/**
 * Daily Reports — Discord delivery (spec: "Reports should post into the
 * configured Discord channel. If posting fails: retry, log failure, notify
 * admin").
 *
 * Reuses the low-level REST client (postChannelMessage) and the AI-ops
 * purpose→channel mapping. Channel resolution precedence (most specific first):
 *   report override → module override → the "daily_reports" mapping → the
 *   AiOpsSettings.defaultReportChannelId fallback.
 *
 * Never throws: every function returns a typed outcome so the module body can
 * record it and the run still finishes cleanly.
 */

import "server-only";

import { log } from "@/lib/ops/log";
import { isDiscordEnabled } from "@/lib/discord/config";
import { postChannelMessage, type DiscordMessagePayload } from "@/lib/discord/client";
import { listChannelMappings } from "../discordChannels";
import { getAiOpsSettings, getModuleConfig } from "../store";
import { DAILY_REPORTS_MODULE } from "./module";
import { reportLabel } from "./reportTypes";

/**
 * Resolves the channel a report posts to, honoring the override precedence.
 * Returns null when nothing is configured (the caller then logs "no channel").
 */
export async function resolveReportChannel(reportChannelId: string | null): Promise<string | null> {
  if (reportChannelId) return reportChannelId;
  const config = await getModuleConfig(DAILY_REPORTS_MODULE);
  if (config?.discordChannelId) return config.discordChannelId;
  try {
    const mappings = await listChannelMappings();
    const mapped = mappings.find((m) => m.purpose === "daily_reports");
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
 * Delivers a report to its resolved channel. Returns a typed outcome; on
 * failure the caller notifies the admin and the run is recorded as failed.
 */
export async function deliverReport(
  reportChannelId: string | null,
  payload: DiscordMessagePayload,
): Promise<PostResult> {
  if (!isDiscordEnabled()) return { ok: false, error: "discord_disabled" };
  const channelId = await resolveReportChannel(reportChannelId);
  if (!channelId) return { ok: false, error: "no_channel_configured" };
  const result = await postWithRetry(channelId, payload);
  if (!result.ok) {
    log.error("daily report post failed", { operation: "ai.daily_reports.post", result: "failed" });
  }
  return result;
}

/**
 * Notifies the admin that a report failed to post, on the alerts channel
 * ("alerts" mapping → AiOpsSettings.defaultAlertChannelId). Best-effort.
 */
export async function notifyReportFailure(reportType: string, reason: string): Promise<void> {
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
          title: "⚠️ Daily report delivery failed",
          description: `The ${reportLabel(reportType)} could not be posted.`,
          color: 0xe74c3c,
          fields: [{ name: "Reason", value: reason.slice(0, 200) || "unknown" }],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } catch (error) {
    log.error("daily report failure alert failed", {
      operation: "ai.daily_reports.alert",
      result: "failed",
      code: error instanceof Error ? error.name : "unknown",
    });
  }
}
