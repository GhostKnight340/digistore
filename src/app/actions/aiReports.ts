"use server";

/**
 * Server actions for the Daily Reports admin page
 * (/admin/ai-operations/reports).
 *
 * Every action requires an admin session (requireAdminCustomer) and returns a
 * typed result. Inputs are validated server-side (cron syntax, channel snowflake
 * format, token/retry clamps) before persisting through reportStore. No secret
 * is ever accepted or returned — provider keys live only in env.
 */

import { revalidatePath } from "next/cache";
import { requireAdminCustomer } from "@/lib/auth";
import type { ActionResult } from "@/lib/dto";
import { updateReportSchedule, setReportEnabled, type ReportScheduleUpdate } from "@/lib/ai-ops/reports/reportStore";
import { parseCron } from "@/lib/ai-ops/reports/reportSchedule";
import { isReportType, type ReportType } from "@/lib/ai-ops/reports/reportTypes";
import { generateReport } from "@/lib/ai-ops/modules/dailyReports";

const REPORTS_PATH = "/admin/ai-operations/reports";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidChannelId(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

export async function saveReportScheduleAction(
  reportType: string,
  input: ReportScheduleUpdate,
): Promise<ActionResult> {
  await requireAdminCustomer();
  if (!isReportType(reportType)) return { ok: false, error: "Unknown report type." };
  try {
    const patch: ReportScheduleUpdate = {};
    if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
    if (typeof input.schedule === "string") {
      if (!parseCron(input.schedule)) return { ok: false, error: "Invalid cron expression (expected 5 fields)." };
      patch.schedule = input.schedule.trim();
    }
    if (input.timezone === null || input.timezone === "") {
      patch.timezone = null;
    } else if (typeof input.timezone === "string") {
      if (!isValidTimezone(input.timezone)) return { ok: false, error: "Unknown timezone." };
      patch.timezone = input.timezone;
    }
    if (input.discordChannelId === null || input.discordChannelId === "") {
      patch.discordChannelId = null;
    } else if (typeof input.discordChannelId === "string") {
      if (!isValidChannelId(input.discordChannelId)) {
        return { ok: false, error: "Invalid Discord channel ID (17–20 digit snowflake)." };
      }
      patch.discordChannelId = input.discordChannelId;
    }
    if (input.modelOverride === null || input.modelOverride === "") patch.modelOverride = null;
    else if (typeof input.modelOverride === "string") patch.modelOverride = input.modelOverride.slice(0, 80);
    if (input.maxTokens === null) patch.maxTokens = null;
    else if (typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens)) {
      patch.maxTokens = Math.min(8000, Math.max(64, Math.trunc(input.maxTokens)));
    }
    if (typeof input.maxRetries === "number" && Number.isFinite(input.maxRetries)) {
      patch.maxRetries = Math.min(5, Math.max(0, Math.trunc(input.maxRetries)));
    }
    await updateReportSchedule(reportType, patch);
    revalidatePath(REPORTS_PATH);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save report." };
  }
}

export async function setReportEnabledAction(reportType: string, enabled: boolean): Promise<ActionResult> {
  await requireAdminCustomer();
  if (!isReportType(reportType)) return { ok: false, error: "Unknown report type." };
  try {
    await setReportEnabled(reportType, enabled);
    revalidatePath(REPORTS_PATH);
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update report." };
  }
}

/** "Run now" — generate AND post to the configured channel (spec: Run now). */
export async function runReportNowAction(reportType: string): Promise<ActionResult> {
  const admin = await requireAdminCustomer();
  if (!isReportType(reportType)) return { ok: false, error: "Unknown report type." };
  const result = await generateReport({
    reportType: reportType as ReportType,
    trigger: "manual",
    deliver: true,
    triggeredBy: admin.name,
  });
  if (!result.ok) return { ok: false, error: `Run blocked: ${result.reason}` };
  revalidatePath(REPORTS_PATH);
  return { ok: true };
}

export type PreviewResult = { ok: true; text: string } | { ok: false; error: string };

/** "Preview" — generate WITHOUT posting; returns the rendered markdown. */
export async function previewReportAction(reportType: string): Promise<PreviewResult> {
  const admin = await requireAdminCustomer();
  if (!isReportType(reportType)) return { ok: false, error: "Unknown report type." };
  const result = await generateReport({
    reportType: reportType as ReportType,
    trigger: "manual",
    deliver: false,
    triggeredBy: admin.name,
  });
  if (!result.ok) return { ok: false, error: `Preview blocked: ${result.reason}` };
  return { ok: true, text: result.text ?? "" };
}
