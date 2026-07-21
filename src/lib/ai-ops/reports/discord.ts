/**
 * Daily Reports — Discord delivery. Thin wrappers over the shared AI-ops
 * delivery helper (src/lib/ai-ops/discord/deliver.ts); the channel precedence is
 * report override → daily_reports module override → "daily_reports" mapping →
 * default report channel. Never throws.
 */

import "server-only";

import type { DiscordMessagePayload } from "@/lib/discord/client";
import { deliverToChannel, notifyAiFailure, type PostResult } from "../discord/deliver";
import { DAILY_REPORTS_MODULE } from "./module";
import { reportLabel } from "./reportTypes";

export type { PostResult };

/** Delivers a report to its resolved channel (report override → module → mapping → default). */
export async function deliverReport(
  reportChannelId: string | null,
  payload: DiscordMessagePayload,
): Promise<PostResult> {
  return deliverToChannel(
    { overrideChannelId: reportChannelId, moduleKey: DAILY_REPORTS_MODULE, purpose: "daily_reports" },
    payload,
    "daily_reports",
  );
}

/** Notifies the admin that a scheduled report failed to post. Best-effort. */
export async function notifyReportFailure(reportType: string, reason: string): Promise<void> {
  return notifyAiFailure(`The ${reportLabel(reportType)}`, reason, "daily_reports");
}
